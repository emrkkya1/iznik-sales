-- ============================================
-- M25: ÖZET PDF — REPORT_* RPC EXTENSIONS
-- ============================================
--
-- Adds 4 bounded-aggregation RPCs used by the Genel Özet (Summary) PDF
-- report. Existing report_* RPCs stay unchanged; the new ones fill gaps:
--
--   * report_product_return_rate — per-product delivered / returned / rate
--                                  / returned ₺ value (page 4 of PDF)
--   * report_daily_returns       — returned_qty time series (pages 2 + 5)
--   * report_daily_delivered     — delivered_qty time series (page 2)
--   * report_branch_balances     — current vs opening + net change per
--                                  branch, sorted by abs(current) DESC
--                                  (page 3 "outstanding balance" list)
--
-- Conventions (unchanged from existing report_* RPCs):
--   * p_range        = 'week' | 'month' | 'all' (delegates to _summary_range)
--   * is_admin()     guard at entry, SECURITY DEFINER + search_path fix
--   * branchBalances carries `p_range` for API symmetry even though the
--     balance snapshot is "as-of now" (range isn't applied to current_balance).
--     Keeping the param avoids a second overloaded function later.
--
-- Balance sign (M20 canonical): positive = Alacak (şube bize borçlu),
-- negative = Borç (biz şubeye borçluyuz). returnedValue uses
-- delivery_items.unit_price — the price snapshot at delivery time, NOT the
-- current branch_product_prices value. This makes the PDF honest: "if those
-- returns had not happened, we'd have had ₺X more in sales for that period."

-- --------------------------------------------
-- 1) report_product_return_rate — page 4
-- --------------------------------------------
-- Top products by return_rate (returned / delivered) within the range.
-- Includes both active and inactive products (mirrors product_distribution
-- which also includes them).
--
-- NOTE: PostgreSQL lowercases unquoted aliases ("AS deliveredQty" becomes
-- JSON key "deliveredqty"). All field names are wrapped in jsonb_build_object
-- so the client sees camelCase like the other report_* RPCs.
CREATE OR REPLACE FUNCTION report_product_return_rate(
  p_range TEXT,
  p_limit INT DEFAULT 100
)
RETURNS JSONB AS $$
DECLARE v_start DATE; v_end DATE; v_granularity TEXT;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN p_limit := 100; END IF;
  SELECT start_date, end_date, granularity
    INTO v_start, v_end, v_granularity
    FROM _summary_range(p_range);

  RETURN COALESCE((
    SELECT jsonb_agg(row_data)
    FROM (
      SELECT
        p.id::text AS id,
        p.name AS label,
        COALESCE(SUM(di.delivered_quantity), 0)::NUMERIC(12,2) AS "deliveredQty",
        COALESCE(SUM(di.returned_quantity), 0)::NUMERIC(12,2)  AS "returnedQty",
        CASE
          WHEN SUM(di.delivered_quantity) = 0 THEN NULL
          ELSE ROUND((SUM(di.returned_quantity) / SUM(di.delivered_quantity) * 100)::NUMERIC, 2)
        END AS "returnRate",
        -- Per-delivery price snapshot (delivery_items.unit_price).
        (COALESCE(SUM(di.returned_quantity * di.unit_price), 0))::NUMERIC(12,2) AS "returnedValue"
      FROM products p
      JOIN delivery_items di ON di.product_id = p.id
      JOIN deliveries d     ON d.id = di.delivery_id
      WHERE d.deleted_at IS NULL
        AND d.date BETWEEN v_start AND v_end
      GROUP BY p.id, p.name
      HAVING SUM(di.delivered_quantity) > 0
      ORDER BY
        (SUM(di.returned_quantity)::NUMERIC / NULLIF(SUM(di.delivered_quantity), 0)) DESC NULLS LAST,
        SUM(di.returned_quantity * di.unit_price) DESC
      LIMIT p_limit
    ) row_data
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

ALTER FUNCTION public.report_product_return_rate(text, integer)
  SET search_path = public, pg_catalog;

-- --------------------------------------------
-- 2) report_daily_returns — pages 2 + 5
-- --------------------------------------------
-- Returns time series of returned_qty, grouped by the same granularity the
-- existing report_daily_series uses (so the two can share an x-axis).
CREATE OR REPLACE FUNCTION report_daily_returns(p_range TEXT)
RETURNS JSONB AS $$
DECLARE v_start DATE; v_end DATE; v_granularity TEXT;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT start_date, end_date, granularity
    INTO v_start, v_end, v_granularity
    FROM _summary_range(p_range);

  RETURN jsonb_build_object(
    'granularity', v_granularity,
    'points', COALESCE((
      SELECT jsonb_agg(row_data ORDER BY bucket)
      FROM (
        SELECT
          to_char(date_trunc(v_granularity, d.date), 'YYYY-MM-DD') AS bucket,
          COALESCE(SUM(di.returned_quantity), 0)::NUMERIC(12,2) AS "returnedQty"
        FROM deliveries d
        JOIN delivery_items di ON di.delivery_id = d.id
        WHERE d.deleted_at IS NULL
          AND d.date BETWEEN v_start AND v_end
        GROUP BY date_trunc(v_granularity, d.date)
      ) row_data
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

ALTER FUNCTION public.report_daily_returns(text)
  SET search_path = public, pg_catalog;

-- --------------------------------------------
-- 3) report_daily_delivered — page 2
-- --------------------------------------------
-- Delivered_qty time series, same shape as report_daily_returns.
CREATE OR REPLACE FUNCTION report_daily_delivered(p_range TEXT)
RETURNS JSONB AS $$
DECLARE v_start DATE; v_end DATE; v_granularity TEXT;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT start_date, end_date, granularity
    INTO v_start, v_end, v_granularity
    FROM _summary_range(p_range);

  RETURN jsonb_build_object(
    'granularity', v_granularity,
    'points', COALESCE((
      SELECT jsonb_agg(row_data ORDER BY bucket)
      FROM (
        SELECT
          to_char(date_trunc(v_granularity, d.date), 'YYYY-MM-DD') AS bucket,
          COALESCE(SUM(di.delivered_quantity), 0)::NUMERIC(12,2) AS "deliveredQty"
        FROM deliveries d
        JOIN delivery_items di ON di.delivery_id = d.id
        WHERE d.deleted_at IS NULL
          AND d.date BETWEEN v_start AND v_end
        GROUP BY date_trunc(v_granularity, d.date)
      ) row_data
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

ALTER FUNCTION public.report_daily_delivered(text)
  SET search_path = public, pg_catalog;

-- --------------------------------------------
-- 4) report_branch_balances — page 3 (c)
-- --------------------------------------------
-- Per-branch balance snapshot, ordered by abs(current_balance) DESC so the
-- "outstanding balance" PDF list naturally mixes Alacak/Borç branches by
-- magnitude. p_range is accepted for API symmetry but the snapshot is
-- as-of now (current_balance is mutated by recalculate_branch_balance at
-- write time, see M20).
--
-- netChange = currentBalance - openingBalance. With the canonical sign
-- convention (+ means receivable), positive netChange means the branch's
-- debt to us grew in the period; negative means they paid down / we paid
-- out.
CREATE OR REPLACE FUNCTION report_branch_balances(p_range TEXT)
RETURNS JSONB AS $$
DECLARE v_start DATE; v_end DATE; v_granularity TEXT;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  -- _summary_range is invoked purely for its validation of p_range — we
  -- do NOT use the dates here, the balance snapshot is current.
  SELECT start_date, end_date, granularity
    INTO v_start, v_end, v_granularity
    FROM _summary_range(p_range);
  PERFORM 1 FROM (SELECT v_start AS s, v_end AS e, v_granularity AS g) bounds;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data)
    FROM (
      SELECT
        b.id::text AS id,
        b.name AS label,
        COALESCE(b.current_balance, 0)::NUMERIC(12,2) AS "currentBalance",
        COALESCE(b.opening_balance, 0)::NUMERIC(12,2) AS "openingBalance",
        (COALESCE(b.current_balance, 0) - COALESCE(b.opening_balance, 0))::NUMERIC(12,2) AS "netChange"
      FROM branches b
      ORDER BY abs(COALESCE(b.current_balance, 0)) DESC, b.name ASC
      LIMIT 50
    ) row_data
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

ALTER FUNCTION public.report_branch_balances(text)
  SET search_path = public, pg_catalog;

-- --------------------------------------------
-- GRANTS
-- --------------------------------------------
GRANT EXECUTE ON FUNCTION report_product_return_rate(TEXT, INT)  TO authenticated;
GRANT EXECUTE ON FUNCTION report_daily_returns(TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION report_daily_delivered(TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION report_branch_balances(TEXT)           TO authenticated;
