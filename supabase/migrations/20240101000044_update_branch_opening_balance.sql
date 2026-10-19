-- Correct a branch's starting balance, not a new sale or collection.
-- Serialize with the global lock and financial writes on this branch.
CREATE FUNCTION public.update_branch_opening_balance(
  p_branch_id UUID,
  p_opening_balance NUMERIC,
  p_expected_opening_balance NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old JSONB;
  v_opening NUMERIC;
  v_locked BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF p_opening_balance IS NULL
     OR p_opening_balance::TEXT IN ('NaN', 'Infinity', '-Infinity')
     OR abs(p_opening_balance) >= 10000000000
     OR p_opening_balance <> round(p_opening_balance, 2) THEN
    RAISE EXCEPTION 'Invalid opening balance';
  END IF;
  IF p_expected_opening_balance IS NULL
     OR p_expected_opening_balance::TEXT IN ('NaN', 'Infinity', '-Infinity')
     OR abs(p_expected_opening_balance) >= 10000000000
     OR p_expected_opening_balance <> round(p_expected_opening_balance, 2) THEN
    RAISE EXCEPTION 'Invalid expected opening balance';
  END IF;

  SELECT opening_balances_locked INTO v_locked FROM public.app_config
  WHERE id = '00000000-0000-0000-0000-000000000001'::UUID FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'app_config row missing'; END IF;
  IF v_locked THEN RAISE EXCEPTION 'Opening balances are locked'; END IF;

  SELECT to_jsonb(b), coalesce(b.opening_balance, 0) INTO v_old, v_opening
  FROM public.branches b WHERE b.id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found'; END IF;
  -- Setting the same absolute value twice is safe even after a lost response.
  IF v_opening = p_opening_balance THEN RETURN; END IF;
  IF v_opening <> p_expected_opening_balance THEN
    RAISE EXCEPTION 'Opening balance changed. Reopen and try again.';
  END IF;

  UPDATE public.branches SET opening_balance = p_opening_balance, updated_at = now()
  WHERE id = p_branch_id;
  PERFORM public.recalculate_branch_balance(p_branch_id);
  PERFORM public.log_audit('UPDATE', 'branches', p_branch_id, v_old);
END $$;

REVOKE ALL ON FUNCTION public.update_branch_opening_balance(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_branch_opening_balance(UUID, NUMERIC, NUMERIC) TO authenticated;
