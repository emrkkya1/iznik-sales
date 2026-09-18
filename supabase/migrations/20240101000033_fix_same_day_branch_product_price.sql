-- A price can be edited more than once on the same day. The old implementation
-- closed the active row at p_effective_from - 1 even when that row started on
-- p_effective_from, producing an invalid daterange (end_date < start_date).
CREATE OR REPLACE FUNCTION public.set_branch_product_price_atomic(
  p_branch_product_id UUID,
  p_new_price NUMERIC(12,2),
  p_effective_from DATE
) RETURNS VOID AS $$
DECLARE
  v_old JSONB;
  v_active_start DATE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_branch_product_id IS NULL THEN RAISE EXCEPTION 'branch_product_id is required'; END IF;
  IF p_new_price IS NULL OR p_new_price <= 0 THEN RAISE EXCEPTION 'Price must be greater than zero'; END IF;
  IF p_effective_from IS NULL OR p_effective_from < CURRENT_DATE THEN
    RAISE EXCEPTION 'effective_from must be today or later';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branch_products WHERE id = p_branch_product_id) THEN
    RAISE EXCEPTION 'Branch product not found';
  END IF;

  -- Lock the active row so concurrent edits cannot both close it and create
  -- overlapping price periods.
  SELECT row_to_json(bpp)::JSONB, bpp.start_date
  INTO v_old, v_active_start
  FROM public.branch_product_prices bpp
  WHERE bpp.branch_product_id = p_branch_product_id AND bpp.end_date IS NULL
  FOR UPDATE;

  IF v_active_start IS NULL THEN
    INSERT INTO public.branch_product_prices (branch_product_id, price, start_date)
    VALUES (p_branch_product_id, p_new_price, p_effective_from);
  ELSIF p_effective_from = v_active_start THEN
    -- Same effective date: amend the not-yet-historical price in place.
    UPDATE public.branch_product_prices
    SET price = p_new_price
    WHERE branch_product_id = p_branch_product_id AND end_date IS NULL;
  ELSIF p_effective_from > v_active_start THEN
    UPDATE public.branch_product_prices
    SET end_date = p_effective_from - 1
    WHERE branch_product_id = p_branch_product_id AND end_date IS NULL;

    INSERT INTO public.branch_product_prices (branch_product_id, price, start_date)
    VALUES (p_branch_product_id, p_new_price, p_effective_from);
  ELSE
    RAISE EXCEPTION 'A price change is already scheduled for a later date';
  END IF;

  PERFORM public.log_audit('UPDATE', 'branch_product_prices', p_branch_product_id, v_old);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;
