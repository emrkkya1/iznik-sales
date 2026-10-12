-- Keep legacy four-argument callers working; new clients supply a retry key.
ALTER TABLE public.payments ADD COLUMN idempotency_key TEXT UNIQUE;
DROP FUNCTION public.record_manual_payment_atomic(UUID, NUMERIC, TEXT, DATE);

CREATE FUNCTION public.record_manual_payment_atomic(
  p_branch_id UUID,
  p_amount NUMERIC,
  p_payment_type TEXT,
  p_date DATE,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_payment_id UUID;
  v_existing public.payments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized to record payments'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount >= 10000000000
     OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Payment amount must be positive, finite, and have at most two decimal places';
  END IF;
  IF p_payment_type IS NULL OR p_payment_type NOT IN ('field_collection', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment type';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    IF btrim(p_idempotency_key) = '' THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
    -- Serialize identical retry keys even if two requests arrive together.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
    SELECT * INTO v_existing FROM public.payments WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.branch_id IS DISTINCT FROM p_branch_id
         OR v_existing.user_id IS DISTINCT FROM auth.uid()
         OR v_existing.amount IS DISTINCT FROM p_amount
         OR v_existing.payment_type IS DISTINCT FROM p_payment_type
         OR v_existing.date IS DISTINCT FROM p_date
         OR v_existing.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Idempotency key belongs to a different or deleted payment';
      END IF;
      RETURN v_existing.id;
    END IF;
  END IF;

  -- Serialize payments to this branch before recalculating its balance.
  PERFORM 1 FROM public.branches WHERE id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;
  INSERT INTO public.payments (branch_id, user_id, delivery_id, amount, payment_type, date, idempotency_key)
  VALUES (p_branch_id, auth.uid(), NULL, p_amount, p_payment_type, p_date, p_idempotency_key)
  RETURNING id INTO v_payment_id;
  PERFORM public.recalculate_branch_balance(p_branch_id);
  PERFORM public.log_audit('INSERT', 'payments', v_payment_id, NULL);
  RETURN v_payment_id;
END $$;

REVOKE ALL ON FUNCTION public.record_manual_payment_atomic(UUID, NUMERIC, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_manual_payment_atomic(UUID, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
