-- M29: PDF-only date, weekday, and product filters.
-- Product filters scope delivery-item quantities and sales only. Payments and
-- balances intentionally remain all-product values and are labeled as such.

DROP FUNCTION IF EXISTS public.report_summary_pdf(TEXT);
DROP FUNCTION IF EXISTS public.report_branches_pdf(TEXT, TEXT, DATE, DATE, SMALLINT[], UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.report_branch_hub_pdf(UUID, DATE, DATE);

CREATE FUNCTION public.report_summary_pdf(
  p_range TEXT DEFAULT 'all',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_days_of_week SMALLINT[] DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_default_start DATE;
  v_default_end DATE;
  v_start DATE;
  v_end DATE;
  v_granularity TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT start_date, end_date, granularity INTO v_default_start, v_default_end, v_granularity
  FROM public._summary_range(p_range);
  v_start := coalesce(p_date_from, v_default_start);
  v_end := coalesce(p_date_to, v_default_end);
  IF v_start > v_end THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF p_days_of_week IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_days_of_week) AS d WHERE d NOT BETWEEN 0 AND 6
  ) THEN RAISE EXCEPTION 'Invalid day of week'; END IF;

  RETURN (
    WITH items AS (
      SELECT d.branch_id, d.date, di.product_id, di.delivered_quantity, di.returned_quantity,
             di.net_quantity, di.unit_price
      FROM public.deliveries d
      JOIN public.delivery_items di ON di.delivery_id = d.id
      WHERE d.deleted_at IS NULL AND d.date BETWEEN v_start AND v_end
        AND (p_days_of_week IS NULL OR extract(dow FROM d.date)::SMALLINT = ANY(p_days_of_week))
    ), payments AS (
      SELECT branch_id, date, amount FROM public.payments
      WHERE deleted_at IS NULL AND date BETWEEN v_start AND v_end
        AND (p_days_of_week IS NULL OR extract(dow FROM date)::SMALLINT = ANY(p_days_of_week))
    ), daily_items AS (
      SELECT date_trunc(v_granularity, date)::date AS bucket,
             sum(net_quantity * unit_price) AS sales, sum(delivered_quantity) AS delivered,
             sum(returned_quantity) AS returned
      FROM items GROUP BY 1
    ), spine AS (
      SELECT date_trunc(v_granularity, gs)::date AS bucket
      FROM generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') gs GROUP BY 1
    ), branch_items AS (
      SELECT branch_id, sum(net_quantity * unit_price) AS sales, sum(delivered_quantity) AS delivered,
             sum(returned_quantity) AS returned FROM items GROUP BY 1
    ), branch_payments AS (
      SELECT branch_id, sum(amount) AS collection FROM payments GROUP BY 1
    ), branch_rollup AS (
      SELECT b.id, b.name, coalesce(b.current_balance, 0) AS balance,
             coalesce(i.sales, 0) AS sales, coalesce(i.delivered, 0) AS delivered,
             coalesce(i.returned, 0) AS returned, coalesce(p.collection, 0) AS collection
      FROM public.branches b
      LEFT JOIN branch_items i ON i.branch_id = b.id
      LEFT JOIN branch_payments p ON p.branch_id = b.id
    ), product_rollup AS (
      SELECT p.id, p.name, sum(i.delivered_quantity) AS delivered, sum(i.returned_quantity) AS returned,
             sum(i.returned_quantity * i.unit_price) AS returned_value
      FROM public.products p JOIN items i ON i.product_id = p.id GROUP BY p.id, p.name
    )
    SELECT jsonb_build_object(
      'schemaVersion', 1, 'range', p_range,
      'snapshotAt', to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'period', jsonb_build_object('startDate', to_char(v_start, 'YYYY-MM-DD'), 'endDate', to_char(v_end, 'YYYY-MM-DD'), 'granularity', v_granularity),
      'filters', jsonb_build_object('dateFrom', to_char(p_date_from, 'YYYY-MM-DD'), 'dateTo', to_char(p_date_to, 'YYYY-MM-DD'), 'daysOfWeek', to_json(p_days_of_week), 'productFilterApplied', false, 'salesProductScoped', false, 'paymentsAllProducts', true, 'balancesAllProducts', true),
      'kpis', jsonb_build_object(
        'totalSales', coalesce((SELECT sum(net_quantity * unit_price) FROM items), 0),
        'totalCollection', coalesce((SELECT sum(amount) FROM payments), 0),
        'deliveredQty', coalesce((SELECT sum(delivered_quantity) FROM items), 0),
        'returnedQty', coalesce((SELECT sum(returned_quantity) FROM items), 0),
        'returnRate', CASE WHEN coalesce((SELECT sum(delivered_quantity) FROM items), 0) = 0 THEN NULL ELSE round((SELECT sum(returned_quantity) FROM items) / (SELECT sum(delivered_quantity) FROM items) * 100, 2) END,
        'activeBranchCount', (SELECT count(*) FROM public.branches WHERE is_active),
        'activeProductCount', (SELECT count(*) FROM public.products WHERE is_active)
      ),
      'dailyPoints', coalesce((SELECT jsonb_agg(jsonb_build_object('bucket', s.bucket, 'sales', coalesce(d.sales, 0), 'deliveredQty', coalesce(d.delivered, 0), 'returnedQty', coalesce(d.returned, 0)) ORDER BY s.bucket) FROM spine s LEFT JOIN daily_items d ON d.bucket = s.bucket), '[]'::jsonb),
      'branchesBySales', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id::text, 'label', name, 'sales', sales, 'collection', collection, 'returnRate', CASE WHEN delivered = 0 THEN NULL ELSE round(returned / delivered * 100, 2) END, 'currentBalance', balance)) FROM (SELECT * FROM branch_rollup WHERE sales > 0 ORDER BY sales DESC, name, id LIMIT 8) x), '[]'::jsonb),
      'branchesByReturnRate', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id::text, 'label', name, 'returnRate', CASE WHEN delivered = 0 THEN NULL ELSE round(returned / delivered * 100, 2) END, 'delivered', delivered, 'returned', returned)) FROM (SELECT * FROM branch_rollup WHERE delivered > 0 ORDER BY (returned / nullif(delivered, 0)) DESC, delivered DESC, name, id LIMIT 5) x), '[]'::jsonb),
      'branchesByBalance', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id::text, 'label', name, 'currentBalance', balance)) FROM (SELECT * FROM branch_rollup WHERE balance <> 0 ORDER BY abs(balance) DESC, name, id LIMIT 5) x), '[]'::jsonb),
      'productsByReturnRate', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id::text, 'label', name, 'delivered', delivered, 'returned', returned, 'returnRate', CASE WHEN delivered = 0 THEN NULL ELSE round(returned / delivered * 100, 2) END, 'returnedValue', returned_value)) FROM (SELECT * FROM product_rollup WHERE delivered > 0 ORDER BY (returned / nullif(delivered, 0)) DESC, returned_value DESC, name, id LIMIT 5) x), '[]'::jsonb),
      'productsByReturnedValue', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id::text, 'label', name, 'delivered', delivered, 'returned', returned, 'returnRate', CASE WHEN delivered = 0 THEN NULL ELSE round(returned / delivered * 100, 2) END, 'returnedValue', returned_value)) FROM (SELECT * FROM product_rollup WHERE returned_value > 0 ORDER BY returned_value DESC, name, id LIMIT 5) x), '[]'::jsonb)
    )
  );
END $$;

CREATE FUNCTION public.report_branches_pdf(
  p_search TEXT DEFAULT NULL, p_status TEXT DEFAULT 'all', p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL, p_days_of_week SMALLINT[] DEFAULT NULL, p_city_id UUID DEFAULT NULL,
  p_district_id UUID DEFAULT NULL, p_sort_by TEXT DEFAULT 'name', p_sort_dir TEXT DEFAULT 'asc',
  p_product_ids UUID[] DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status TEXT := lower(coalesce(p_status, 'all')); v_sort_by TEXT := lower(coalesce(p_sort_by, 'name')); v_sort_dir TEXT := lower(coalesce(p_sort_dir, 'asc')); v_search TEXT := nullif(trim(p_search), ''); v_cap INT := 1000;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_status NOT IN ('all', 'active', 'inactive') THEN RAISE EXCEPTION 'Invalid status: %', p_status; END IF;
  IF v_sort_by NOT IN ('name', 'balance', 'return_rate', 'last_activity', 'location') THEN RAISE EXCEPTION 'Invalid sort: %', p_sort_by; END IF;
  IF v_sort_dir NOT IN ('asc', 'desc') THEN RAISE EXCEPTION 'Invalid sort direction: %', p_sort_dir; END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF p_days_of_week IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_days_of_week) d WHERE d NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION 'Invalid day of week'; END IF;
  IF p_city_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cities WHERE id = p_city_id) THEN RAISE EXCEPTION 'Invalid city'; END IF;
  IF p_district_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.districts WHERE id = p_district_id) THEN RAISE EXCEPTION 'Invalid district'; END IF;
  IF p_product_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_product_ids) AS selected(product_id) WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = selected.product_id)) THEN RAISE EXCEPTION 'Invalid product'; END IF;
  RETURN (
    WITH filtered_branches AS (
      SELECT b.id branch_id, b.name branch_name, c.name city_name, d.name district_name, coalesce(b.current_balance, 0) current_balance, coalesce(b.is_active, false) is_active
      FROM public.branches b JOIN public.districts d ON d.id = b.district_id JOIN public.cities c ON c.id = d.city_id
      WHERE (v_search IS NULL OR strpos(lower(b.name), lower(v_search)) > 0) AND (v_status = 'all' OR (v_status = 'active' AND b.is_active) OR (v_status = 'inactive' AND NOT b.is_active)) AND (p_city_id IS NULL OR d.city_id = p_city_id) AND (p_district_id IS NULL OR b.district_id = p_district_id)
    ), item_metrics AS (
      SELECT d.branch_id, sum(di.net_quantity * di.unit_price) sales_total, sum(di.delivered_quantity) delivered_qty, sum(di.returned_quantity) returned_qty, count(DISTINCT d.id)::int delivery_count, max(d.date) last_delivery_date
      FROM public.deliveries d JOIN public.delivery_items di ON di.delivery_id = d.id
      WHERE d.deleted_at IS NULL AND (p_date_from IS NULL OR d.date >= p_date_from) AND (p_date_to IS NULL OR d.date <= p_date_to) AND (p_days_of_week IS NULL OR extract(dow FROM d.date)::smallint = ANY(p_days_of_week)) AND (p_product_ids IS NULL OR di.product_id = ANY(p_product_ids)) GROUP BY d.branch_id
    ), payment_metrics AS (
      SELECT branch_id, sum(amount) collection_total, count(*)::int payment_count, max(date) last_payment_date FROM public.payments
      WHERE deleted_at IS NULL AND (p_date_from IS NULL OR date >= p_date_from) AND (p_date_to IS NULL OR date <= p_date_to) AND (p_days_of_week IS NULL OR extract(dow FROM date)::smallint = ANY(p_days_of_week)) GROUP BY branch_id
    ), rows AS (
      SELECT b.*, coalesce(i.sales_total, 0) sales_total, coalesce(i.delivered_qty, 0) delivered_qty, coalesce(i.returned_qty, 0) returned_qty, coalesce(i.delivery_count, 0) delivery_count, coalesce(p.collection_total, 0) collection_total, coalesce(p.payment_count, 0) payment_count, greatest(i.last_delivery_date, p.last_payment_date) last_activity_date
      FROM filtered_branches b LEFT JOIN item_metrics i ON i.branch_id = b.branch_id LEFT JOIN payment_metrics p ON p.branch_id = b.branch_id
    ), ordered AS (
      SELECT rows.*, row_number() OVER (ORDER BY CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'asc' THEN branch_name END ASC, CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'desc' THEN branch_name END DESC, CASE WHEN v_sort_by = 'balance' AND v_sort_dir = 'asc' THEN current_balance END ASC, CASE WHEN v_sort_by = 'balance' AND v_sort_dir = 'desc' THEN current_balance END DESC, CASE WHEN v_sort_by = 'return_rate' AND v_sort_dir = 'asc' THEN returned_qty / nullif(delivered_qty, 0) END ASC NULLS LAST, CASE WHEN v_sort_by = 'return_rate' AND v_sort_dir = 'desc' THEN returned_qty / nullif(delivered_qty, 0) END DESC NULLS LAST, CASE WHEN v_sort_by = 'last_activity' AND v_sort_dir = 'asc' THEN last_activity_date END ASC NULLS LAST, CASE WHEN v_sort_by = 'last_activity' AND v_sort_dir = 'desc' THEN last_activity_date END DESC NULLS LAST, CASE WHEN v_sort_by = 'location' AND v_sort_dir = 'asc' THEN city_name END ASC, CASE WHEN v_sort_by = 'location' AND v_sort_dir = 'desc' THEN city_name END DESC, branch_name, branch_id) pos FROM rows
    ) SELECT jsonb_build_object(
      'schemaVersion', 1, 'snapshotAt', to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'filters', jsonb_build_object('search', v_search, 'status', v_status, 'dateFrom', to_char(p_date_from, 'YYYY-MM-DD'), 'dateTo', to_char(p_date_to, 'YYYY-MM-DD'), 'daysOfWeek', to_json(p_days_of_week), 'cityName', (SELECT name FROM public.cities WHERE id = p_city_id), 'districtName', (SELECT name FROM public.districts WHERE id = p_district_id), 'sortBy', v_sort_by, 'sortDir', v_sort_dir, 'productIds', to_json(p_product_ids), 'productFilterApplied', p_product_ids IS NOT NULL, 'salesProductScoped', p_product_ids IS NOT NULL, 'paymentsAllProducts', true, 'balancesAllProducts', true),
      'summary', (SELECT jsonb_build_object('branchCount', count(*)::int, 'activeBranchCount', count(*) FILTER (WHERE is_active)::int, 'totalSales', coalesce(sum(sales_total), 0), 'totalCollection', coalesce(sum(collection_total), 0), 'deliveredQty', coalesce(sum(delivered_qty), 0), 'returnedQty', coalesce(sum(returned_qty), 0), 'returnRate', CASE WHEN coalesce(sum(delivered_qty), 0) = 0 THEN NULL ELSE round(sum(returned_qty) / sum(delivered_qty) * 100, 2) END, 'balanceSum', coalesce(sum(current_balance), 0), 'lastActivityDate', max(last_activity_date)) FROM rows),
      'rows', coalesce((SELECT jsonb_agg(jsonb_build_object('branchId', branch_id::text, 'name', branch_name, 'cityName', city_name, 'districtName', district_name, 'currentBalance', current_balance, 'deliveredQty', delivered_qty, 'returnedQty', returned_qty, 'returnRate', CASE WHEN delivered_qty = 0 THEN NULL ELSE round(returned_qty / delivered_qty * 100, 2) END, 'lastActivityDate', last_activity_date, 'isActive', is_active, 'salesTotal', sales_total, 'collectionTotal', collection_total, 'deliveryCount', delivery_count, 'paymentCount', payment_count) ORDER BY pos) FROM (SELECT * FROM ordered ORDER BY pos LIMIT v_cap) x), '[]'::jsonb), 'totalCount', (SELECT count(*) FROM rows), 'truncated', (SELECT count(*) > v_cap FROM rows)
    )
  );
END $$;

CREATE FUNCTION public.report_branch_hub_pdf(
  p_branch_id UUID, p_date_from DATE DEFAULT NULL, p_date_to DATE DEFAULT NULL,
  p_days_of_week SMALLINT[] DEFAULT NULL, p_product_ids UUID[] DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'branch_id is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id) THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  IF p_date_to IS NOT NULL AND p_date_to > (now() AT TIME ZONE 'Europe/Istanbul')::date THEN RAISE EXCEPTION 'date_to cannot be in the future'; END IF;
  IF p_days_of_week IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_days_of_week) d WHERE d NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION 'Invalid day of week'; END IF;
  IF p_product_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_product_ids) AS selected(product_id) WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = selected.product_id)) THEN RAISE EXCEPTION 'Invalid product'; END IF;
  RETURN (
    WITH branch AS (SELECT b.*, d.name district_name, c.name city_name FROM public.branches b JOIN public.districts d ON d.id = b.district_id JOIN public.cities c ON c.id = d.city_id WHERE b.id = p_branch_id), deliv AS (
      SELECT d.id, d.date FROM public.deliveries d WHERE d.branch_id = p_branch_id AND d.deleted_at IS NULL AND (p_date_from IS NULL OR d.date >= p_date_from) AND (p_date_to IS NULL OR d.date <= p_date_to) AND (p_days_of_week IS NULL OR extract(dow FROM d.date)::smallint = ANY(p_days_of_week))
    ), items AS (
      SELECT d.date, di.product_id, di.delivered_quantity, di.returned_quantity, di.net_quantity, di.unit_price FROM deliv d JOIN public.delivery_items di ON di.delivery_id = d.id WHERE p_product_ids IS NULL OR di.product_id = ANY(p_product_ids)
    ), payments_period AS (
      SELECT amount FROM public.payments WHERE branch_id = p_branch_id AND deleted_at IS NULL AND (p_date_from IS NULL OR date >= p_date_from) AND (p_date_to IS NULL OR date <= p_date_to) AND (p_days_of_week IS NULL OR extract(dow FROM date)::smallint = ANY(p_days_of_week))
    ), products AS (
      SELECT p.id, p.name, sum(i.delivered_quantity) delivered, sum(i.returned_quantity) returned, sum(i.net_quantity) net_qty, sum(i.net_quantity * i.unit_price) sales, sum(i.returned_quantity * i.unit_price) returned_value FROM public.products p JOIN items i ON i.product_id = p.id GROUP BY p.id, p.name ORDER BY sales DESC, p.name, p.id LIMIT 50
    ), daily AS (SELECT date bucket, sum(net_quantity * unit_price) sales FROM items GROUP BY date ORDER BY date DESC LIMIT 366), movements AS (
      SELECT jsonb_build_object('id', d.id::text, 'kind', 'delivery', 'date', d.date, 'amount', sum(di.net_quantity * di.unit_price), 'isDeleted', false, 'createdAt', raw.created_at, 'payment', (SELECT jsonb_build_object('id', p.id::text, 'amount', p.amount, 'paymentType', p.payment_type, 'createdAt', p.created_at) FROM public.payments p WHERE p.delivery_id = d.id AND p.deleted_at IS NULL ORDER BY p.created_at LIMIT 1)) row_data, d.date bucket_date, raw.created_at
      FROM deliv d JOIN public.deliveries raw ON raw.id = d.id JOIN public.delivery_items di ON di.delivery_id = d.id
      WHERE p_product_ids IS NULL OR di.product_id = ANY(p_product_ids)
      GROUP BY d.id, d.date, raw.created_at
      UNION ALL
      SELECT jsonb_build_object('id', p.id::text, 'kind', 'payment', 'date', p.date, 'amount', p.amount, 'paymentType', p.payment_type, 'isDeleted', p.deleted_at IS NOT NULL, 'createdAt', p.created_at), p.date, p.created_at
      FROM public.payments p WHERE p.branch_id = p_branch_id AND p.delivery_id IS NULL AND (p_date_from IS NULL OR p.date >= p_date_from) AND (p_date_to IS NULL OR p.date <= p_date_to) AND (p_days_of_week IS NULL OR extract(dow FROM p.date)::smallint = ANY(p_days_of_week))
    )
    SELECT jsonb_build_object(
      'schemaVersion', 1, 'snapshotAt', to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'identity', jsonb_build_object('id', (SELECT id::text FROM branch), 'name', (SELECT name FROM branch), 'cityName', (SELECT city_name FROM branch), 'districtName', (SELECT district_name FROM branch), 'isActive', (SELECT is_active FROM branch), 'branchCreatedAt', (SELECT created_at FROM branch), 'openingBalance', (SELECT opening_balance FROM branch), 'currentBalance', (SELECT current_balance FROM branch), 'activeProductCount', (SELECT count(DISTINCT bp.product_id) FROM public.branch_products bp JOIN public.products p ON p.id = bp.product_id WHERE bp.branch_id = p_branch_id AND bp.is_active AND p.is_active), 'totalProductCount', (SELECT count(*) FROM public.products WHERE is_active), 'lastMovementDate', greatest(coalesce((SELECT max(date) FROM public.deliveries WHERE branch_id = p_branch_id AND deleted_at IS NULL), '1900-01-01'::date), coalesce((SELECT max(date) FROM public.payments WHERE branch_id = p_branch_id AND deleted_at IS NULL), '1900-01-01'::date)), 'auditCount', (SELECT count(*) FROM public.audit_logs WHERE record_id = p_branch_id)),
      'period', jsonb_build_object('dateFrom', to_char(p_date_from, 'YYYY-MM-DD'), 'dateTo', to_char(p_date_to, 'YYYY-MM-DD'), 'daysOfWeek', to_json(p_days_of_week), 'productIds', to_json(p_product_ids), 'productFilterApplied', p_product_ids IS NOT NULL, 'salesProductScoped', p_product_ids IS NOT NULL, 'paymentsAllProducts', true, 'balancesAllProducts', true),
      'periodOpeningBalance', (SELECT opening_balance FROM branch) + coalesce((SELECT sum(total_sales_amount) FROM public.deliveries WHERE branch_id = p_branch_id AND deleted_at IS NULL AND p_date_from IS NOT NULL AND date < p_date_from), 0) - coalesce((SELECT sum(amount) FROM public.payments WHERE branch_id = p_branch_id AND deleted_at IS NULL AND p_date_from IS NOT NULL AND date < p_date_from), 0),
      'metrics', jsonb_build_object('totalSales', coalesce((SELECT sum(net_quantity * unit_price) FROM items), 0), 'totalCollection', coalesce((SELECT sum(amount) FROM payments_period), 0), 'deliveredQty', coalesce((SELECT sum(delivered_quantity) FROM items), 0), 'returnedQty', coalesce((SELECT sum(returned_quantity) FROM items), 0), 'returnRate', CASE WHEN coalesce((SELECT sum(delivered_quantity) FROM items), 0) = 0 THEN NULL ELSE round((SELECT sum(returned_quantity) FROM items) / (SELECT sum(delivered_quantity) FROM items) * 100, 2) END, 'collectionRate', CASE WHEN coalesce((SELECT sum(net_quantity * unit_price) FROM items), 0) = 0 THEN NULL ELSE round((SELECT sum(amount) FROM payments_period) / (SELECT sum(net_quantity * unit_price) FROM items) * 100, 2) END),
      'dailySales', coalesce((SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'sales', sales) ORDER BY bucket) FROM daily), '[]'::jsonb),
      'products', coalesce((SELECT jsonb_agg(jsonb_build_object('productId', id, 'productName', name, 'deliveredQty', delivered, 'returnedQty', returned, 'netQty', net_qty, 'sales', sales, 'returnedValue', returned_value, 'returnRate', CASE WHEN delivered = 0 THEN NULL ELSE round(returned / delivered * 100, 2) END)) FROM products), '[]'::jsonb),
      'movements', coalesce((SELECT jsonb_agg(row_data ORDER BY bucket_date DESC, created_at DESC) FROM (SELECT * FROM movements ORDER BY bucket_date DESC, created_at DESC LIMIT 500) x), '[]'::jsonb), 'movementCount', (SELECT count(*) FROM movements), 'movementTruncated', (SELECT count(*) > 500 FROM movements)
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.report_summary_pdf(TEXT, DATE, DATE, SMALLINT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_branches_pdf(TEXT, TEXT, DATE, DATE, SMALLINT[], UUID, UUID, TEXT, TEXT, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_branch_hub_pdf(UUID, DATE, DATE, SMALLINT[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_summary_pdf(TEXT, DATE, DATE, SMALLINT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_branches_pdf(TEXT, TEXT, DATE, DATE, SMALLINT[], UUID, UUID, TEXT, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_branch_hub_pdf(UUID, DATE, DATE, SMALLINT[], UUID[]) TO authenticated;
