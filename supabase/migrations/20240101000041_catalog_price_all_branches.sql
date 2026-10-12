-- Optional atomic propagation to existing assignments only. Keep recorded
-- delivery unit prices and past price periods unchanged.
DROP FUNCTION public.set_catalog_product_default_price(UUID, NUMERIC);
CREATE FUNCTION public.set_catalog_product_default_price(
  p_product_id UUID, p_default_price NUMERIC(12,2), p_update_branches BOOLEAN DEFAULT FALSE
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old JSONB;
  v_assignment RECORD;
  v_price public.branch_product_prices%ROWTYPE;
  v_next DATE;
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_default_price IS NULL OR p_default_price < 0
    OR p_default_price::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Default price must be a finite non-negative number';
  END IF;
  IF p_update_branches IS NULL THEN RAISE EXCEPTION 'update_branches is required'; END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.products p WHERE id = p_product_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  UPDATE public.products SET default_price = p_default_price, updated_at = NOW() WHERE id = p_product_id;
  PERFORM public.log_audit('UPDATE', 'products', p_product_id, v_old);
  IF p_update_branches THEN
    FOR v_assignment IN SELECT id FROM public.branch_products WHERE product_id = p_product_id ORDER BY id FOR UPDATE LOOP
      -- Include inactive assignments. Preserve explicitly scheduled future
      -- changes; the new price applies from today until the next scheduled one.
      SELECT * INTO v_price FROM public.branch_product_prices
      WHERE branch_product_id = v_assignment.id AND start_date <= CURRENT_DATE
        AND (end_date IS NULL OR end_date >= CURRENT_DATE) FOR UPDATE;
      IF FOUND THEN
        IF v_price.price = p_default_price THEN CONTINUE; END IF;
        IF v_price.start_date = CURRENT_DATE THEN
          UPDATE public.branch_product_prices SET price = p_default_price WHERE id = v_price.id;
          PERFORM public.log_audit('UPDATE', 'branch_product_prices', v_price.id, to_jsonb(v_price));
        ELSE
          UPDATE public.branch_product_prices SET end_date = CURRENT_DATE - 1 WHERE id = v_price.id;
          PERFORM public.log_audit('UPDATE', 'branch_product_prices', v_price.id, to_jsonb(v_price));
          INSERT INTO public.branch_product_prices(branch_product_id, price, start_date, end_date)
          VALUES(v_assignment.id, p_default_price, CURRENT_DATE, v_price.end_date) RETURNING id INTO v_id;
          PERFORM public.log_audit('INSERT', 'branch_product_prices', v_id, NULL);
        END IF;
      ELSE
        SELECT MIN(start_date) INTO v_next FROM public.branch_product_prices
          WHERE branch_product_id = v_assignment.id AND start_date > CURRENT_DATE;
        INSERT INTO public.branch_product_prices(branch_product_id, price, start_date, end_date)
        VALUES(v_assignment.id, p_default_price, CURRENT_DATE, v_next - 1) RETURNING id INTO v_id;
        PERFORM public.log_audit('INSERT', 'branch_product_prices', v_id, NULL);
      END IF;
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_catalog_product_default_price(UUID, NUMERIC, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_catalog_product_default_price(UUID, NUMERIC, BOOLEAN) TO authenticated;
