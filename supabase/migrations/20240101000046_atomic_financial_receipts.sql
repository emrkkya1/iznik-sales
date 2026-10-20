-- Durable operation receipts bind retry identities to actor + canonical input.
-- Results are immutable acknowledgements of a transaction, not current-state
-- queries. In particular, retrying an edit must never reapply an old edit.
CREATE TABLE public.financial_write_receipts (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 200 AND btrim(key) <> ''),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  input JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_write_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_write_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_write_receipts TO service_role;

CREATE FUNCTION public.canonical_delivery_items(p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Items must be an array'; END IF;
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'Select at most 200 products'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i
    WHERE jsonb_typeof(i->'product_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(i->'delivered_quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(i->'returned_quantity') IS DISTINCT FROM 'number') THEN
    RAISE EXCEPTION 'Invalid product quantities';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i
    WHERE (i->>'delivered_quantity')::NUMERIC < 0 OR (i->>'returned_quantity')::NUMERIC < 0
      OR (i->>'delivered_quantity')::NUMERIC >= 10000000000 OR (i->>'returned_quantity')::NUMERIC >= 10000000000
      OR (i->>'delivered_quantity')::NUMERIC <> round((i->>'delivered_quantity')::NUMERIC, 2)
      OR (i->>'returned_quantity')::NUMERIC <> round((i->>'returned_quantity')::NUMERIC, 2)) THEN
    RAISE EXCEPTION 'Invalid product quantities';
  END IF;
  IF (SELECT count(DISTINCT (i->>'product_id')::UUID) FROM jsonb_array_elements(p_items) i) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Duplicate product';
  END IF;
  RETURN (SELECT jsonb_agg(jsonb_build_object('product_id', (i->>'product_id')::UUID,
    'delivered_quantity', (i->>'delivered_quantity')::NUMERIC,
    'returned_quantity', (i->>'returned_quantity')::NUMERIC) ORDER BY (i->>'product_id')::UUID)
    FROM jsonb_array_elements(p_items) i);
END $$;

CREATE FUNCTION public.delivery_transaction_receipt(p_id UUID, p_previous_balance NUMERIC)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('deliveryId', d.id, 'branchId', b.id, 'branchName', b.name, 'date', d.date,
    'totalSalesAmount', d.total_sales_amount,
    'paymentAmount', coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.delivery_id = d.id AND p.deleted_at IS NULL), 0),
    'previousBalance', p_previous_balance, 'newBalance', coalesce(b.current_balance, 0),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('productName', p.name,
      'deliveredQuantity', i.delivered_quantity, 'returnedQuantity', i.returned_quantity,
      'netQuantity', i.net_quantity, 'unitPrice', i.unit_price, 'lineTotal', i.net_quantity * i.unit_price) ORDER BY i.product_id)
      FROM public.delivery_items i JOIN public.products p ON p.id = i.product_id WHERE i.delivery_id = d.id), '[]'::JSONB))
  FROM public.deliveries d JOIN public.branches b ON b.id = d.branch_id WHERE d.id = p_id;
$$;

CREATE FUNCTION public.create_delivery_receipt_internal(p_branch_id UUID, p_items JSONB,
  p_payment_amount NUMERIC, p_payment_type TEXT, p_date DATE, p_key TEXT, p_require_receipt BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_items JSONB; v_input JSONB; v_request public.financial_write_receipts%ROWTYPE;
  v_old public.deliveries%ROWTYPE; v_old_items JSONB; v_before NUMERIC; v_id UUID; v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active) THEN RAISE EXCEPTION 'Not authorized to create deliveries'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch is required'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  IF p_payment_amount IS NULL OR p_payment_amount::TEXT IN ('NaN', 'Infinity', '-Infinity')
    OR p_payment_amount < 0 OR p_payment_amount >= 10000000000 OR p_payment_amount <> round(p_payment_amount, 2)
    OR p_payment_type IS NULL OR p_payment_type NOT IN ('field_collection', 'bank_transfer') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  IF p_require_receipt AND p_key IS NULL THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF p_key IS NOT NULL AND (btrim(p_key) = '' OR length(p_key) > 200) THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  v_items := public.canonical_delivery_items(p_items);
  v_input := jsonb_build_object('kind', 'create_delivery', 'branchId', p_branch_id, 'items', v_items,
    'paymentAmount', p_payment_amount, 'paymentType', p_payment_type, 'date', p_date);
  IF p_key IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_receipt:' || p_key, 0));
    SELECT * INTO v_request FROM public.financial_write_receipts WHERE key = p_key;
    IF FOUND THEN
      IF v_request.actor_id <> auth.uid() OR v_request.input <> v_input THEN RAISE EXCEPTION 'Retry key belongs to a different operation'; END IF;
      RETURN v_request.result;
    END IF;
  END IF;
  SELECT coalesce(current_balance, 0) INTO v_before FROM public.branches WHERE id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF p_key IS NOT NULL THEN
    SELECT * INTO v_old FROM public.deliveries WHERE idempotency_key = p_key;
    IF FOUND THEN
      SELECT jsonb_agg(jsonb_build_object('product_id', product_id, 'delivered_quantity', delivered_quantity,
        'returned_quantity', returned_quantity) ORDER BY product_id) INTO v_old_items
        FROM public.delivery_items WHERE delivery_id = v_old.id;
      IF v_old.user_id IS DISTINCT FROM auth.uid() OR v_old.branch_id IS DISTINCT FROM p_branch_id
        OR v_old.date IS DISTINCT FROM p_date OR v_old.deleted_at IS NOT NULL OR v_old_items IS DISTINCT FROM v_items
        OR coalesce((SELECT sum(amount) FROM public.payments WHERE delivery_id = v_old.id AND deleted_at IS NULL), 0) <> p_payment_amount
        OR EXISTS (SELECT 1 FROM public.payments WHERE delivery_id = v_old.id AND deleted_at IS NULL AND payment_type <> p_payment_type) THEN
        RAISE EXCEPTION 'Retry key belongs to a different operation';
      END IF;
      -- A pre-migration write has no transaction-boundary balance snapshot.
      -- Keep UUID replay for old APKs, but never manufacture a v2 receipt.
      IF p_require_receipt THEN RAISE EXCEPTION 'Legacy operation requires reconciliation'; END IF;
      RETURN jsonb_build_object('deliveryId', v_old.id);
    END IF;
  END IF;
  v_id := public.create_delivery_atomic_before_history(p_branch_id, v_items, p_payment_amount, p_payment_type, p_date, p_key);
  v_result := public.delivery_transaction_receipt(v_id, v_before);
  IF p_key IS NOT NULL THEN
    INSERT INTO public.financial_write_receipts(key, actor_id, input, result) VALUES (p_key, auth.uid(), v_input, v_result);
  END IF;
  RETURN v_result;
END $$;

-- Preserve UUID-returning legacy creation, including keyless older callers.
CREATE OR REPLACE FUNCTION public.create_delivery_atomic(p_branch_id UUID, p_items JSONB,
  p_payment_amount NUMERIC, p_payment_type TEXT, p_date DATE, p_idempotency_key TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT (public.create_delivery_receipt_internal(p_branch_id, p_items, p_payment_amount,
    p_payment_type, p_date, p_idempotency_key, false)->>'deliveryId')::UUID;
$$;

CREATE FUNCTION public.create_delivery_with_receipt(p_branch_id UUID, p_items JSONB,
  p_payment_amount NUMERIC, p_payment_type TEXT, p_date DATE, p_idempotency_key TEXT, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized for operation actor'; END IF;
  RETURN public.create_delivery_receipt_internal(p_branch_id, p_items, p_payment_amount,
    p_payment_type, p_date, p_idempotency_key, true);
END;
$$;

CREATE FUNCTION public.update_delivery_with_receipt(p_delivery_id UUID, p_items JSONB, p_date DATE, p_idempotency_key TEXT, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_items JSONB; v_input JSONB; v_request public.financial_write_receipts%ROWTYPE;
  v_branch UUID; v_before NUMERIC; v_result JSONB;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized for operation actor'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active) THEN RAISE EXCEPTION 'Not authorized to edit deliveries'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 200 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  v_items := public.canonical_delivery_items(p_items);
  v_input := jsonb_build_object('kind', 'update_delivery', 'deliveryId', p_delivery_id, 'items', v_items, 'date', p_date);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_receipt:' || p_idempotency_key, 0));
  SELECT * INTO v_request FROM public.financial_write_receipts WHERE key = p_idempotency_key;
  IF FOUND THEN
    IF v_request.actor_id <> auth.uid() OR v_request.input <> v_input THEN RAISE EXCEPTION 'Retry key belongs to a different operation'; END IF;
    RETURN v_request.result;
  END IF;
  SELECT branch_id INTO v_branch FROM public.deliveries WHERE id = p_delivery_id;
  SELECT coalesce(current_balance, 0) INTO v_before FROM public.branches WHERE id = v_branch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found'; END IF;
  PERFORM public.update_delivery_atomic(p_delivery_id, v_items, p_date);
  v_result := public.delivery_transaction_receipt(p_delivery_id, v_before);
  INSERT INTO public.financial_write_receipts(key, actor_id, input, result) VALUES (p_idempotency_key, auth.uid(), v_input, v_result);
  RETURN v_result;
END $$;

CREATE FUNCTION public.record_manual_payment_with_receipt(p_branch_id UUID, p_amount NUMERIC,
  p_payment_type TEXT, p_date DATE, p_idempotency_key TEXT, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_input JSONB; v_request public.financial_write_receipts%ROWTYPE; v_id UUID; v_result JSONB;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized for operation actor'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized to record payments'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 200 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
  v_input := jsonb_build_object('kind', 'manual_payment', 'branchId', p_branch_id, 'amount', p_amount, 'paymentType', p_payment_type, 'date', p_date);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_write_receipt:' || p_idempotency_key, 0));
  SELECT * INTO v_request FROM public.financial_write_receipts WHERE key = p_idempotency_key;
  IF FOUND THEN
    IF v_request.actor_id <> auth.uid() OR v_request.input <> v_input THEN RAISE EXCEPTION 'Retry key belongs to a different operation'; END IF;
    RETURN v_request.result;
  END IF;
  -- The existing RPC acquires its key lock BEFORE its branch lock. Keep that
  -- order; transaction locks remain held while constructing the result below.
  v_id := public.record_manual_payment_atomic(p_branch_id, p_amount, p_payment_type, p_date, p_idempotency_key);
  SELECT jsonb_build_object('id', id, 'branchId', branch_id, 'userId', user_id, 'deliveryId', delivery_id,
    'amount', amount, 'paymentType', payment_type, 'date', date, 'deletedAt', deleted_at,
    'deletedBy', deleted_by, 'deletionReason', deletion_reason)
  INTO v_result FROM public.payments WHERE id = v_id;
  INSERT INTO public.financial_write_receipts(key, actor_id, input, result) VALUES (p_idempotency_key, auth.uid(), v_input, v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.canonical_delivery_items(JSONB), public.delivery_transaction_receipt(UUID, NUMERIC),
  public.create_delivery_receipt_internal(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_delivery_atomic(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT),
  public.create_delivery_with_receipt(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT, UUID),
  public.update_delivery_with_receipt(UUID, JSONB, DATE, TEXT, UUID),
  public.record_manual_payment_with_receipt(UUID, NUMERIC, TEXT, DATE, TEXT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_delivery_atomic(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT),
  public.create_delivery_with_receipt(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT, UUID),
  public.update_delivery_with_receipt(UUID, JSONB, DATE, TEXT, UUID),
  public.record_manual_payment_with_receipt(UUID, NUMERIC, TEXT, DATE, TEXT, UUID)
  TO authenticated;
