-- ============================================
-- M28: ÖZET PDF — SINGLE ATOMIC REPORT SNAPSHOT
-- ============================================
--
-- Replaces the four M25 per-report RPCs (report_product_return_rate,
-- report_daily_returns, report_daily_delivered, report_branch_balances) with
-- ONE aggregate RPC that returns the entire PDF payload in a single
-- statement. This guarantees:
--
--   * one network round trip (no cross-request drift),
--   * one database snapshot (all sections share start/end/granularity),
--   * one authorization boundary,
--   * one Zod-validated client contract.
--
-- Balance sign (M20 canonical): positive = Alacak (branch owes us),
-- negative = Borç. currentBalance is an as-of-now snapshot; sales,
-- collection, delivered/returned are period-scoped.

DROP FUNCTION IF EXISTS public.report_product_return_rate(TEXT, INT);
DROP FUNCTION IF EXISTS public.report_daily_returns(TEXT);
DROP FUNCTION IF EXISTS public.report_daily_delivered(TEXT);
DROP FUNCTION IF EXISTS public.report_branch_balances(TEXT);

CREATE OR REPLACE FUNCTION report_summary_pdf(p_range TEXT)
RETURNS JSONB AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_granularity TEXT;
  v_result JSONB;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT start_date, end_date, granularity
    INTO v_start, v_end, v_granularity
    FROM _summary_range(p_range);

  WITH
    -- One row per delivery (sales live on deliveries, so this CTE is NOT
    -- joined to delivery_items — that would multiply total_sales_amount).
    sales AS (
      SELECT branch_id, date, total_sales_amount
      FROM deliveries
      WHERE deleted_at IS NULL AND date BETWEEN v_start AND v_end
    ),
    items AS (
      SELECT
        d.branch_id, d.date, di.product_id,
        di.delivered_quantity, di.returned_quantity, di.unit_price
      FROM deliveries d
      JOIN delivery_items di ON di.delivery_id = d.id
      WHERE d.deleted_at IS NULL AND d.date BETWEEN v_start AND v_end
    ),
    payments AS (
      SELECT branch_id, date, amount
      FROM payments
      WHERE deleted_at IS NULL AND date BETWEEN v_start AND v_end
    ),

    -- ── KPIs (org-wide, period-scoped) ────────────────────────────────
    kpis AS (
      SELECT
        (SELECT COALESCE(SUM(total_sales_amount), 0) FROM sales) AS totalSales,
        (SELECT COALESCE(SUM(amount), 0) FROM payments) AS totalCollection,
        (SELECT COALESCE(SUM(delivered_quantity), 0) FROM items) AS deliveredQty,
        (SELECT COALESCE(SUM(returned_quantity), 0) FROM items) AS returnedQty,
        (SELECT COUNT(*) FROM branches WHERE is_active = TRUE) AS activeBranchCount,
        (SELECT COUNT(DISTINCT p.id)
           FROM products p
          WHERE p.is_active = TRUE
            AND EXISTS (
              SELECT 1 FROM branch_products bp
              JOIN branches b ON b.id = bp.branch_id
              WHERE bp.product_id = p.id
                AND bp.is_active = TRUE
                AND b.is_active = TRUE
            )) AS activeProductCount
    ),

    -- ── Daily spine (zero-filled, aligned) ────────────────────────────
    spine AS (
      SELECT date_trunc(v_granularity, gs)::date AS bucket
      FROM generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') gs
      GROUP BY 1
    ),
    daily_sales AS (
      SELECT date_trunc(v_granularity, date)::date AS bucket,
             COALESCE(SUM(total_sales_amount), 0) AS sales
      FROM sales
      GROUP BY 1
    ),
    daily_items AS (
      SELECT date_trunc(v_granularity, date)::date AS bucket,
             COALESCE(SUM(delivered_quantity), 0) AS deliveredQty,
             COALESCE(SUM(returned_quantity), 0) AS returnedQty
      FROM items
      GROUP BY 1
    ),
    daily_points AS (
      SELECT
        s.bucket,
        COALESCE(ds.sales, 0)::NUMERIC(12,2)        AS sales,
        COALESCE(di.deliveredQty, 0)::NUMERIC(12,2) AS deliveredQty,
        COALESCE(di.returnedQty, 0)::NUMERIC(12,2)  AS returnedQty
      FROM spine s
      LEFT JOIN daily_sales ds ON ds.bucket = s.bucket
      LEFT JOIN daily_items di ON di.bucket = s.bucket
      ORDER BY s.bucket
    ),

    -- ── Per-branch aggregates (page 1 + 2) ────────────────────────────
    branch_sales AS (
      SELECT branch_id, SUM(total_sales_amount) AS sales FROM sales GROUP BY branch_id
    ),
    branch_collection AS (
      SELECT branch_id, SUM(amount) AS collection FROM payments GROUP BY branch_id
    ),
    branch_items AS (
      SELECT branch_id,
             SUM(delivered_quantity) AS delivered,
             SUM(returned_quantity) AS returned
      FROM items GROUP BY branch_id
    ),
    branch_rollup AS (
      SELECT
        b.id, b.name, COALESCE(b.current_balance, 0) AS currentBalance,
        COALESCE(bs.sales, 0)::NUMERIC(12,2)        AS sales,
        COALESCE(bc.collection, 0)::NUMERIC(12,2)   AS collection,
        COALESCE(bi.delivered, 0)::NUMERIC(12,2)    AS delivered,
        COALESCE(bi.returned, 0)::NUMERIC(12,2)     AS returned,
        CASE WHEN COALESCE(bi.delivered, 0) = 0 THEN NULL
             ELSE ROUND((COALESCE(bi.returned, 0) / COALESCE(bi.delivered, 0) * 100)::NUMERIC, 2)
        END AS returnRate
      FROM branches b
      LEFT JOIN branch_sales bs ON bs.branch_id = b.id
      LEFT JOIN branch_collection bc ON bc.branch_id = b.id
      LEFT JOIN branch_items bi ON bi.branch_id = b.id
    ),

    -- ── Products (page 2) ─────────────────────────────────────────────
    product_rollup AS (
      SELECT
        p.id, p.name,
        COALESCE(SUM(di.delivered_quantity), 0)::NUMERIC(12,2)              AS delivered,
        COALESCE(SUM(di.returned_quantity), 0)::NUMERIC(12,2)               AS returned,
        COALESCE(SUM(di.returned_quantity * di.unit_price), 0)::NUMERIC(12,2) AS returnedValue,
        CASE WHEN COALESCE(SUM(di.delivered_quantity), 0) = 0 THEN NULL
             ELSE ROUND((SUM(di.returned_quantity) / SUM(di.delivered_quantity) * 100)::NUMERIC, 2)
        END AS returnRate
      FROM products p
      JOIN delivery_items di ON di.product_id = p.id
      JOIN deliveries d ON d.id = di.delivery_id
      WHERE d.deleted_at IS NULL AND d.date BETWEEN v_start AND v_end
      GROUP BY p.id, p.name
    )

  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'range', p_range,
    'snapshotAt', to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'period', jsonb_build_object(
      'startDate', to_char(v_start, 'YYYY-MM-DD'),
      'endDate', to_char(v_end, 'YYYY-MM-DD'),
      'granularity', v_granularity
    ),
    'kpis', jsonb_build_object(
      'totalSales', (SELECT totalSales FROM kpis),
      'totalCollection', (SELECT totalCollection FROM kpis),
      'deliveredQty', (SELECT deliveredQty FROM kpis),
      'returnedQty', (SELECT returnedQty FROM kpis),
      'returnRate', CASE
        WHEN (SELECT deliveredQty FROM kpis) = 0 THEN NULL
        ELSE ROUND(((SELECT returnedQty FROM kpis) / (SELECT deliveredQty FROM kpis) * 100)::NUMERIC, 2)
      END,
      'activeBranchCount', (SELECT activeBranchCount FROM kpis),
      'activeProductCount', (SELECT activeProductCount FROM kpis)
    ),
    'dailyPoints', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'bucket', bucket,
        'sales', sales,
        'deliveredQty', deliveredQty,
        'returnedQty', returnedQty
      ) ORDER BY bucket)
      FROM daily_points
    ), '[]'::jsonb),
    'branchesBySales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id::text, 'label', name,
        'sales', sales, 'collection', collection,
        'returnRate', returnRate, 'currentBalance', currentBalance
      ))
      FROM (
        SELECT * FROM branch_rollup
        WHERE sales > 0
        ORDER BY sales DESC, name ASC, id ASC
        LIMIT 8
      ) t
    ), '[]'::jsonb),
    'branchesByReturnRate', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id::text, 'label', name,
        'returnRate', returnRate, 'delivered', delivered, 'returned', returned
      ))
      FROM (
        SELECT * FROM branch_rollup
        WHERE delivered > 0
        ORDER BY returnRate DESC NULLS LAST, delivered DESC, name ASC, id ASC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'branchesByBalance', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id::text, 'label', name, 'currentBalance', currentBalance
      ))
      FROM (
        SELECT * FROM branch_rollup
        WHERE currentBalance <> 0
        ORDER BY abs(currentBalance) DESC, name ASC, id ASC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'productsByReturnRate', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id::text, 'label', name,
        'delivered', delivered, 'returned', returned,
        'returnRate', returnRate, 'returnedValue', returnedValue
      ))
      FROM (
        SELECT * FROM product_rollup
        WHERE delivered > 0
        ORDER BY returnRate DESC NULLS LAST, returnedValue DESC, name ASC, id ASC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'productsByReturnedValue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id::text, 'label', name,
        'delivered', delivered, 'returned', returned,
        'returnRate', returnRate, 'returnedValue', returnedValue
      ))
      FROM (
        SELECT * FROM product_rollup
        WHERE returnedValue > 0
        ORDER BY returnedValue DESC, name ASC, id ASC
        LIMIT 5
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

ALTER FUNCTION public.report_summary_pdf(text) SET search_path = public, pg_catalog;

-- --------------------------------------------
-- GRANTS
-- --------------------------------------------
REVOKE ALL ON FUNCTION public.report_summary_pdf(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_summary_pdf(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_summary_pdf(TEXT) TO authenticated;
