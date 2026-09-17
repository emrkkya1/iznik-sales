-- ============================================
-- M27: ŞUBE DETAY RAPORU PDF — SNAPSHOT RPC
-- ============================================
-- report_branch_hub_pdf returns a single-branch report snapshot in one round
-- trip: identity, period metrics, period-opening balance, per-product
-- performance, a daily sales series, and a capped movement ledger.
--
-- p_date_from / p_date_to are optional; NULL means "all time". In that case
-- periodOpeningBalance = opening_balance (no prior activity to fold in).
--
-- Conventions (unchanged): is_admin() guard, SECURITY DEFINER, empty
-- search_path + fully-qualified names, camelCase jsonb_build_object keys,
-- historical unit_price for sales/returned value, canonical balance sign.

CREATE OR REPLACE FUNCTION public.report_branch_hub_pdf(
  p_branch_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cap INT := 500;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id) THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;
  IF p_date_to IS NOT NULL AND p_date_to > (now() AT TIME ZONE 'Europe/Istanbul')::date THEN
    RAISE EXCEPTION 'date_to cannot be in the future';
  END IF;

  WITH branch AS (
    SELECT b.*, d.name AS district_name, c.name AS city_name
    FROM public.branches b
    JOIN public.districts d ON d.id = b.district_id
    JOIN public.cities c ON c.id = d.city_id
    WHERE b.id = p_branch_id
  ),
  -- period-scoped deliveries + items (metrics / products / daily)
  deliv AS (
    SELECT id, date, total_sales_amount
    FROM public.deliveries
    WHERE branch_id = p_branch_id
      AND deleted_at IS NULL
      AND (p_date_from IS NULL OR date >= p_date_from)
      AND (p_date_to IS NULL OR date <= p_date_to)
  ),
  items AS (
    SELECT
      di.product_id, di.delivered_quantity, di.returned_quantity,
      di.unit_price, di.net_quantity
    FROM public.delivery_items di
    JOIN deliv d ON d.id = di.delivery_id
  ),
  payments_period AS (
    SELECT amount
    FROM public.payments
    WHERE branch_id = p_branch_id
      AND deleted_at IS NULL
      AND (p_date_from IS NULL OR date >= p_date_from)
      AND (p_date_to IS NULL OR date <= p_date_to)
  ),
  metrics AS (
    SELECT
      (SELECT coalesce(sum(total_sales_amount), 0) FROM deliv) AS total_sales,
      (SELECT coalesce(sum(amount), 0) FROM payments_period) AS total_collection,
      (SELECT coalesce(sum(delivered_quantity), 0) FROM items) AS delivered_qty,
      (SELECT coalesce(sum(returned_quantity), 0) FROM items) AS returned_qty
  ),
  opening AS (
    SELECT
      (SELECT opening_balance FROM branch)
      + (SELECT coalesce(sum(total_sales_amount), 0)
           FROM public.deliveries
          WHERE branch_id = p_branch_id AND deleted_at IS NULL
            AND p_date_from IS NOT NULL AND date < p_date_from)
      - (SELECT coalesce(sum(amount), 0)
           FROM public.payments
          WHERE branch_id = p_branch_id AND deleted_at IS NULL
            AND p_date_from IS NOT NULL AND date < p_date_from)
      AS period_opening_balance
  ),
  products AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      coalesce(sum(di.delivered_quantity), 0) AS delivered,
      coalesce(sum(di.returned_quantity), 0) AS returned,
      coalesce(sum(di.net_quantity), 0) AS net_qty,
      coalesce(sum(di.net_quantity * di.unit_price), 0) AS sales,
      coalesce(sum(di.returned_quantity * di.unit_price), 0) AS returned_value
    FROM public.products p
    JOIN items di ON di.product_id = p.id
    GROUP BY p.id, p.name
    ORDER BY sales DESC, p.name ASC, p.id ASC
    LIMIT 50
  ),
  daily AS (
    SELECT date AS bucket, sum(total_sales_amount) AS sales
    FROM deliv
    GROUP BY date
    ORDER BY date DESC
    LIMIT 366
  ),
  movements_all AS (
    SELECT row_data, bucket_date, created_at FROM (
      SELECT
        jsonb_build_object(
          'id', d.id::text,
          'kind', 'delivery',
          'date', d.date,
          'amount', d.total_sales_amount,
          'isDeleted', d.deleted_at IS NOT NULL,
          'createdAt', d.created_at,
          'payment', CASE WHEN pay.id IS NOT NULL THEN
            jsonb_build_object(
              'id', pay.id::text,
              'amount', pay.amount,
              'paymentType', pay.payment_type,
              'createdAt', pay.created_at
            )
          ELSE NULL END
        ) AS row_data,
        d.date AS bucket_date,
        d.created_at
      FROM public.deliveries d
      LEFT JOIN LATERAL (
        SELECT * FROM public.payments
        WHERE delivery_id = d.id AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      ) pay ON TRUE
      WHERE d.branch_id = p_branch_id
        AND (p_date_from IS NULL OR d.date >= p_date_from)
        AND (p_date_to IS NULL OR d.date <= p_date_to)

      UNION ALL

      SELECT
        jsonb_build_object(
          'id', pay.id::text,
          'kind', 'payment',
          'date', pay.date,
          'amount', pay.amount,
          'paymentType', pay.payment_type,
          'isDeleted', pay.deleted_at IS NOT NULL,
          'createdAt', pay.created_at
        ) AS row_data,
        pay.date AS bucket_date,
        pay.created_at
      FROM public.payments pay
      WHERE pay.branch_id = p_branch_id
        AND pay.delivery_id IS NULL
        AND (p_date_from IS NULL OR pay.date >= p_date_from)
        AND (p_date_to IS NULL OR pay.date <= p_date_to)
    ) merged
  )
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'snapshotAt', to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'identity', jsonb_build_object(
      'id', (SELECT id::text FROM branch),
      'name', (SELECT name FROM branch),
      'cityName', (SELECT city_name FROM branch),
      'districtName', (SELECT district_name FROM branch),
      'isActive', (SELECT is_active FROM branch),
      'branchCreatedAt', (SELECT created_at FROM branch),
      'openingBalance', (SELECT opening_balance FROM branch),
      'currentBalance', (SELECT current_balance FROM branch),
      'activeProductCount', (
        SELECT COUNT(DISTINCT bp.product_id)
        FROM public.branch_products bp
        JOIN public.products p ON p.id = bp.product_id
        WHERE bp.branch_id = p_branch_id AND bp.is_active = TRUE AND p.is_active = TRUE
      ),
      'totalProductCount', (SELECT COUNT(*) FROM public.products WHERE is_active = TRUE),
      'lastMovementDate', GREATEST(
        coalesce((SELECT max(date) FROM public.deliveries WHERE branch_id = p_branch_id AND deleted_at IS NULL), '1900-01-01'::date),
        coalesce((SELECT max(date) FROM public.payments WHERE branch_id = p_branch_id AND deleted_at IS NULL), '1900-01-01'::date)
      ),
      'auditCount', (SELECT COUNT(*) FROM public.audit_logs WHERE record_id = p_branch_id)
    ),
    'period', jsonb_build_object(
      'dateFrom', to_char(p_date_from, 'YYYY-MM-DD'),
      'dateTo', to_char(p_date_to, 'YYYY-MM-DD')
    ),
    'periodOpeningBalance', (SELECT period_opening_balance FROM opening),
    'metrics', jsonb_build_object(
      'totalSales', (SELECT total_sales FROM metrics),
      'totalCollection', (SELECT total_collection FROM metrics),
      'deliveredQty', (SELECT delivered_qty FROM metrics),
      'returnedQty', (SELECT returned_qty FROM metrics),
      'returnRate', CASE
        WHEN (SELECT delivered_qty FROM metrics) = 0 THEN NULL
        ELSE round((SELECT returned_qty FROM metrics) / (SELECT delivered_qty FROM metrics) * 100, 2)
      END,
      'collectionRate', CASE
        WHEN (SELECT total_sales FROM metrics) = 0 THEN NULL
        ELSE round((SELECT total_collection FROM metrics) / (SELECT total_sales FROM metrics) * 100, 2)
      END
    ),
    'dailySales', coalesce((
      SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'sales', sales) ORDER BY bucket)
      FROM daily
    ), '[]'::jsonb),
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'productId', product_id,
        'productName', product_name,
        'deliveredQty', delivered,
        'returnedQty', returned,
        'netQty', net_qty,
        'sales', sales,
        'returnedValue', returned_value,
        'returnRate', CASE WHEN delivered = 0 THEN NULL ELSE round(returned / delivered * 100, 2) END
      ))
      FROM products
    ), '[]'::jsonb),
    'movements', coalesce((
      SELECT jsonb_agg(row_data ORDER BY bucket_date DESC, created_at DESC)
      FROM (SELECT * FROM movements_all ORDER BY bucket_date DESC, created_at DESC LIMIT v_cap) sub
    ), '[]'::jsonb),
    'movementCount', (SELECT count(*) FROM movements_all),
    'movementTruncated', ((SELECT count(*) FROM movements_all) > v_cap)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_branch_hub_pdf(UUID, DATE, DATE) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.report_branch_hub_pdf(UUID, DATE, DATE) TO authenticated;
