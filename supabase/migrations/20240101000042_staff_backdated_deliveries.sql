-- Staff may enter missed deliveries for past dates using the price effective
-- on that date. Future creation, bank transfers, and historical editing remain
-- restricted. The public wrapper still checks active users and locks the branch.
CREATE OR REPLACE FUNCTION public.create_delivery_atomic_before_history(
  p_branch_id UUID,
  p_items JSONB,
  p_payment_amount NUMERIC,
  p_payment_type TEXT,
  p_date DATE,
  p_idempotency_key TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_delivery_id UUID;
  v_total_amount NUMERIC(12,2) := 0;
  v_item JSONB;
  v_branch_product_id UUID;
  v_unit_price NUMERIC(12,2);
  v_net_quantity NUMERIC(12,2);
BEGIN
  IF p_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  IF NOT public.is_admin() THEN
    IF p_date > (now() AT TIME ZONE 'Europe/Istanbul')::DATE THEN
      RAISE EXCEPTION 'Staff cannot create future deliveries';
    END IF;
    IF p_payment_type IS DISTINCT FROM 'field_collection' THEN
      RAISE EXCEPTION 'Staff can only record field collections';
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Items must be an array';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  INSERT INTO public.deliveries (branch_id, user_id, total_sales_amount, date, idempotency_key)
  VALUES (p_branch_id, auth.uid(), 0, p_date, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_delivery_id;

  IF v_delivery_id IS NULL THEN
    SELECT id INTO v_delivery_id FROM public.deliveries WHERE idempotency_key = p_idempotency_key;
    RETURN v_delivery_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id INTO v_branch_product_id FROM public.branch_products
    WHERE branch_id = p_branch_id AND product_id = (v_item->>'product_id')::UUID AND is_active = TRUE;
    IF v_branch_product_id IS NULL THEN RAISE EXCEPTION 'Product not available at this branch'; END IF;

    v_unit_price := public.get_effective_price(v_branch_product_id, p_date);
    IF v_unit_price IS NULL THEN RAISE EXCEPTION 'No price found for product on date %', p_date; END IF;

    v_net_quantity := (v_item->>'delivered_quantity')::NUMERIC - (v_item->>'returned_quantity')::NUMERIC;
    v_total_amount := v_total_amount + (v_net_quantity * v_unit_price);
    INSERT INTO public.delivery_items (delivery_id, product_id, delivered_quantity, returned_quantity, unit_price)
    VALUES (v_delivery_id, (v_item->>'product_id')::UUID,
      (v_item->>'delivered_quantity')::NUMERIC, (v_item->>'returned_quantity')::NUMERIC, v_unit_price);
  END LOOP;

  UPDATE public.deliveries SET total_sales_amount = v_total_amount WHERE id = v_delivery_id;
  IF p_payment_amount > 0 THEN
    INSERT INTO public.payments (branch_id, user_id, delivery_id, amount, payment_type, date)
    VALUES (p_branch_id, auth.uid(), v_delivery_id, p_payment_amount, p_payment_type, p_date);
  END IF;
  PERFORM public.recalculate_branch_balance(p_branch_id);
  PERFORM public.log_audit('INSERT', 'deliveries', v_delivery_id, NULL);
  RETURN v_delivery_id;
END $$;

-- This implementation is callable only through the checked public wrapper.
REVOKE ALL ON FUNCTION public.create_delivery_atomic_before_history(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT)
  FROM PUBLIC, anon, authenticated;
