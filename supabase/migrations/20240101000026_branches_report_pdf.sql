-- ============================================
-- M26: ŞUBELER RAPORU PDF — SNAPSHOT RPC
-- ============================================
-- report_branches_pdf returns the FULL filtered branch set (not paginated)
-- plus a summary + filter echo, so the Şubeler PDF can be generated in one
-- round trip and is byte-identical to the on-screen list (same filter
-- predicates and ordering as list_branches_analytics / M23).
--
-- Differences from M23:
--   * no p_limit / p_offset (a 1000-row safety cap + `truncated` flag instead)
--   * money columns: salesTotal (deliveries.total_sales_amount) and
--     collectionTotal (payments.amount), plus delivery/payment counts
--   * a summary block (totals over the filtered set)
--   * a filter echo with server-resolved city/district names
--
-- Important semantics (unchanged from M23): date/day-of-week filters gate
-- ONLY the activity metrics, not branch membership — branches with no
-- matching activity still appear with zeroed metrics.

CREATE OR REPLACE FUNCTION public.report_branches_pdf(
  p_search       TEXT         DEFAULT NULL,
  p_status       TEXT         DEFAULT 'all',
  p_date_from    DATE         DEFAULT NULL,
  p_date_to      DATE         DEFAULT NULL,
  p_days_of_week SMALLINT[]   DEFAULT NULL,
  p_city_id      UUID         DEFAULT NULL,
  p_district_id  UUID         DEFAULT NULL,
  p_sort_by      TEXT         DEFAULT 'name',
  p_sort_dir     TEXT         DEFAULT 'asc'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status TEXT := lower(coalesce(p_status, 'all'));
  v_sort_by TEXT := lower(coalesce(p_sort_by, 'name'));
  v_sort_dir TEXT := lower(coalesce(p_sort_dir, 'asc'));
  v_search TEXT := nullif(trim(p_search), '');
  v_cap INT := 1000;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_status NOT IN ('all', 'active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;
  IF v_sort_by NOT IN ('name', 'balance', 'return_rate', 'last_activity', 'location') THEN
    RAISE EXCEPTION 'Invalid sort: %', p_sort_by;
  END IF;
  IF v_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort direction: %', p_sort_dir;
  END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL
     AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;
  IF p_days_of_week IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_days_of_week) AS selected_day
    WHERE selected_day NOT BETWEEN 0 AND 6
  ) THEN
    RAISE EXCEPTION 'Invalid day of week';
  END IF;
  IF p_city_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cities WHERE id = p_city_id
  ) THEN
    RAISE EXCEPTION 'Invalid city';
  END IF;
  IF p_district_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.districts WHERE id = p_district_id
  ) THEN
    RAISE EXCEPTION 'Invalid district';
  END IF;

  WITH filtered_branches AS (
    SELECT
      b.id AS branch_id,
      b.name AS branch_name,
      c.name AS city_name,
      d.name AS district_name,
      coalesce(b.current_balance, 0) AS current_balance,
      coalesce(b.is_active, false) AS is_active
    FROM public.branches b
    JOIN public.districts d ON d.id = b.district_id
    JOIN public.cities c ON c.id = d.city_id
    WHERE (v_search IS NULL OR strpos(lower(b.name), lower(v_search)) > 0)
      AND (
        v_status = 'all'
        OR (v_status = 'active' AND b.is_active IS TRUE)
        OR (v_status = 'inactive' AND b.is_active IS FALSE)
      )
      AND (p_city_id IS NULL OR d.city_id = p_city_id)
      AND (p_district_id IS NULL OR b.district_id = p_district_id)
  ),
  -- Sales/count live on deliveries; this CTE must NOT join delivery_items
  -- (that would multiply total_sales_amount per line item).
  sales_metrics AS (
    SELECT
      delivery.branch_id,
      coalesce(sum(delivery.total_sales_amount), 0) AS sales_total,
      count(*) AS delivery_count,
      max(delivery.date) AS last_delivery_date
    FROM public.deliveries delivery
    WHERE delivery.deleted_at IS NULL
      AND (p_date_from IS NULL OR delivery.date >= p_date_from)
      AND (p_date_to IS NULL OR delivery.date <= p_date_to)
      AND (
        p_days_of_week IS NULL
        OR extract(dow FROM delivery.date)::SMALLINT = ANY(p_days_of_week)
      )
    GROUP BY delivery.branch_id
  ),
  delivery_metrics AS (
    SELECT
      delivery.branch_id,
      coalesce(sum(item.delivered_quantity), 0) AS delivered_qty,
      coalesce(sum(item.returned_quantity), 0) AS returned_qty
    FROM public.deliveries delivery
    LEFT JOIN public.delivery_items item ON item.delivery_id = delivery.id
    WHERE delivery.deleted_at IS NULL
      AND (p_date_from IS NULL OR delivery.date >= p_date_from)
      AND (p_date_to IS NULL OR delivery.date <= p_date_to)
      AND (
        p_days_of_week IS NULL
        OR extract(dow FROM delivery.date)::SMALLINT = ANY(p_days_of_week)
      )
    GROUP BY delivery.branch_id
  ),
  payment_metrics AS (
    SELECT
      payment.branch_id,
      coalesce(sum(payment.amount), 0) AS collection_total,
      count(*) AS payment_count,
      max(payment.date) AS last_payment_date
    FROM public.payments payment
    WHERE payment.deleted_at IS NULL
      AND (p_date_from IS NULL OR payment.date >= p_date_from)
      AND (p_date_to IS NULL OR payment.date <= p_date_to)
      AND (
        p_days_of_week IS NULL
        OR extract(dow FROM payment.date)::SMALLINT = ANY(p_days_of_week)
      )
    GROUP BY payment.branch_id
  ),
  branch_rows AS (
    SELECT
      branch.*,
      coalesce(sales.sales_total, 0) AS sales_total,
      coalesce(sales.delivery_count, 0) AS delivery_count,
      coalesce(delivery.delivered_qty, 0) AS delivered_qty,
      coalesce(delivery.returned_qty, 0) AS returned_qty,
      coalesce(payment.collection_total, 0) AS collection_total,
      coalesce(payment.payment_count, 0) AS payment_count,
      CASE
        WHEN coalesce(delivery.delivered_qty, 0) = 0 THEN NULL
        ELSE round(
          delivery.returned_qty / nullif(delivery.delivered_qty, 0) * 100,
          2
        )
      END AS return_rate,
      CASE
        WHEN sales.last_delivery_date IS NULL THEN payment.last_payment_date
        WHEN payment.last_payment_date IS NULL THEN sales.last_delivery_date
        ELSE greatest(sales.last_delivery_date, payment.last_payment_date)
      END AS last_activity_date
    FROM filtered_branches branch
    LEFT JOIN sales_metrics sales ON sales.branch_id = branch.branch_id
    LEFT JOIN delivery_metrics delivery ON delivery.branch_id = branch.branch_id
    LEFT JOIN payment_metrics payment ON payment.branch_id = branch.branch_id
  ),
  ordered_rows AS (
    SELECT
      branch_rows.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'asc'
            THEN branch_name END ASC,
          CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'desc'
            THEN branch_name END DESC,
          CASE WHEN v_sort_by = 'balance' AND v_sort_dir = 'asc'
            THEN current_balance END ASC,
          CASE WHEN v_sort_by = 'balance' AND v_sort_dir = 'desc'
            THEN current_balance END DESC,
          CASE WHEN v_sort_by = 'return_rate' AND v_sort_dir = 'asc'
            THEN return_rate END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'return_rate' AND v_sort_dir = 'desc'
            THEN return_rate END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'last_activity' AND v_sort_dir = 'asc'
            THEN last_activity_date END ASC NULLS LAST,
          CASE WHEN v_sort_by = 'last_activity' AND v_sort_dir = 'desc'
            THEN last_activity_date END DESC NULLS LAST,
          CASE WHEN v_sort_by = 'location' AND v_sort_dir = 'asc'
            THEN lower(city_name) END ASC,
          CASE WHEN v_sort_by = 'location' AND v_sort_dir = 'asc'
            THEN lower(district_name) END ASC,
          CASE WHEN v_sort_by = 'location' AND v_sort_dir = 'desc'
            THEN lower(city_name) END DESC,
          CASE WHEN v_sort_by = 'location' AND v_sort_dir = 'desc'
            THEN lower(district_name) END DESC,
          branch_name ASC,
          branch_id ASC
      ) AS sort_position
    FROM branch_rows
  ),
  summary AS (
    SELECT
      count(*)::INT AS branch_count,
      count(*) FILTER (WHERE is_active)::INT AS active_branch_count,
      coalesce(sum(sales_total), 0) AS total_sales,
      coalesce(sum(collection_total), 0) AS total_collection,
      coalesce(sum(delivered_qty), 0) AS delivered_qty,
      coalesce(sum(returned_qty), 0) AS returned_qty,
      CASE
        WHEN coalesce(sum(delivered_qty), 0) = 0 THEN NULL
        ELSE round(sum(returned_qty) / nullif(sum(delivered_qty), 0) * 100, 2)
      END AS return_rate,
      coalesce(sum(current_balance), 0) AS balance_sum,
      max(last_activity_date) AS last_activity_date
    FROM branch_rows
  )
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'snapshotAt', to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'filters', jsonb_build_object(
      'search', v_search,
      'status', v_status,
      'dateFrom', to_char(p_date_from, 'YYYY-MM-DD'),
      'dateTo', to_char(p_date_to, 'YYYY-MM-DD'),
      'daysOfWeek', to_json(p_days_of_week),
      'cityName', (SELECT name FROM public.cities WHERE id = p_city_id),
      'districtName', (SELECT name FROM public.districts WHERE id = p_district_id),
      'sortBy', v_sort_by,
      'sortDir', v_sort_dir
    ),
    'summary', (SELECT jsonb_build_object(
      'branchCount', branch_count,
      'activeBranchCount', active_branch_count,
      'totalSales', total_sales,
      'totalCollection', total_collection,
      'deliveredQty', delivered_qty,
      'returnedQty', returned_qty,
      'returnRate', return_rate,
      'balanceSum', balance_sum,
      'lastActivityDate', last_activity_date
    ) FROM summary),
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'branchId', row.branch_id::TEXT,
          'name', row.branch_name,
          'cityName', row.city_name,
          'districtName', row.district_name,
          'currentBalance', row.current_balance,
          'deliveredQty', row.delivered_qty,
          'returnedQty', row.returned_qty,
          'returnRate', row.return_rate,
          'lastActivityDate', row.last_activity_date,
          'isActive', row.is_active,
          'salesTotal', row.sales_total,
          'collectionTotal', row.collection_total,
          'deliveryCount', row.delivery_count,
          'paymentCount', row.payment_count
        ) ORDER BY row.sort_position
      )
      FROM (SELECT * FROM ordered_rows ORDER BY sort_position LIMIT v_cap) row
    ), '[]'::JSONB),
    'totalCount', (SELECT count(*) FROM branch_rows),
    'truncated', ((SELECT count(*) FROM branch_rows) > v_cap)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_branches_pdf(
  TEXT, TEXT, DATE, DATE, SMALLINT[], UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.report_branches_pdf(
  TEXT, TEXT, DATE, DATE, SMALLINT[], UUID, UUID, TEXT, TEXT
) TO authenticated;
