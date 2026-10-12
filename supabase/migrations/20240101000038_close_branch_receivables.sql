-- One immutable receipt per bulk request makes whole-batch retries safe.
CREATE TABLE public.receivable_payment_batches (
  idempotency_key TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  input JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receivable_payment_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receivable_payment_batches FROM PUBLIC, anon, authenticated;
-- Server-only inspection/retention cleanup; application clients cannot read
-- or alter the journal. Writes are owned by the SECURITY DEFINER RPC below.
GRANT SELECT, DELETE ON public.receivable_payment_batches TO service_role;

CREATE FUNCTION public.close_branch_receivables(
  p_branches JSONB,
  p_payment_type TEXT,
  p_date DATE,
  p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_branches JSONB;
  v_input JSONB;
  v_batch public.receivable_payment_batches%ROWTYPE;
  v_item JSONB;
  v_branch_id UUID;
  v_expected NUMERIC;
  v_balance NUMERIC;
  v_payment_id UUID;
  v_payments JSONB := '[]'::JSONB;
  v_total NUMERIC := 0;
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized to record payments'; END IF;
  IF p_branches IS NULL OR jsonb_typeof(p_branches) <> 'array' THEN
    RAISE EXCEPTION 'Branches must be an array';
  END IF;
  IF jsonb_array_length(p_branches) = 0 OR jsonb_array_length(p_branches) > 1000 THEN
    RAISE EXCEPTION 'Select between 1 and 1000 branches';
  END IF;
  IF p_payment_type IS NULL OR p_payment_type NOT IN ('field_collection', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment type';
  END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Payment date is required'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_branches) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR jsonb_typeof(v_item->'branchId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item->'expectedAmount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid branch input';
    END IF;
    v_branch_id := (v_item->>'branchId')::UUID;
    v_expected := (v_item->>'expectedAmount')::NUMERIC;
    IF v_expected <= 0 OR v_expected >= 10000000000 OR v_expected <> round(v_expected, 2) THEN
      RAISE EXCEPTION 'Invalid receivable amount';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT (value->>'branchId')::UUID) FROM jsonb_array_elements(p_branches)) <> jsonb_array_length(p_branches) THEN
    RAISE EXCEPTION 'Duplicate branch';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('branchId', (value->>'branchId')::UUID,
    'expectedAmount', (value->>'expectedAmount')::NUMERIC) ORDER BY (value->>'branchId')::UUID)
  INTO v_branches FROM jsonb_array_elements(p_branches);
  v_input := jsonb_build_object('branches', v_branches, 'paymentType', p_payment_type, 'date', p_date);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('close_branch_receivables:' || p_idempotency_key, 0));
  SELECT * INTO v_batch FROM public.receivable_payment_batches WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_batch.user_id <> auth.uid() OR v_batch.input <> v_input THEN
      RAISE EXCEPTION 'Idempotency key belongs to a different batch';
    END IF;
    RETURN v_batch.result;
  END IF;

  -- Acquire every branch lock in canonical order before checking any balance.
  PERFORM b.id FROM public.branches b
  JOIN jsonb_array_elements(v_branches) item ON b.id = (item->>'branchId')::UUID
  ORDER BY b.id FOR UPDATE OF b;
  IF (SELECT count(*) FROM public.branches b JOIN jsonb_array_elements(v_branches) item
      ON b.id = (item->>'branchId')::UUID) <> jsonb_array_length(v_branches) THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_branches) LOOP
    v_branch_id := (v_item->>'branchId')::UUID;
    v_expected := (v_item->>'expectedAmount')::NUMERIC;
    v_balance := public.recalculate_branch_balance(v_branch_id);
    IF v_balance <= 0 OR v_balance <> v_expected THEN
      RAISE EXCEPTION 'Branch balances changed. Refresh and confirm again.' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_branches) LOOP
    v_branch_id := (v_item->>'branchId')::UUID;
    v_expected := (v_item->>'expectedAmount')::NUMERIC;
    v_payment_id := public.record_manual_payment_atomic(v_branch_id, v_expected, p_payment_type, p_date);
    v_payments := v_payments || jsonb_build_array(jsonb_build_object(
      'branchId', v_branch_id, 'paymentId', v_payment_id, 'amount', v_expected));
    v_total := v_total + v_expected;
  END LOOP;
  v_result := jsonb_build_object('payments', v_payments, 'totalAmount', v_total);
  INSERT INTO public.receivable_payment_batches (idempotency_key, user_id, input, result)
  VALUES (p_idempotency_key, auth.uid(), v_input, v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.close_branch_receivables(JSONB, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_branch_receivables(JSONB, TEXT, DATE, TEXT) TO authenticated;
