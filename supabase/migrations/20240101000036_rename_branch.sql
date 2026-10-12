-- Rename an existing branch without replacing its identity or financial data.
CREATE FUNCTION public.rename_branch(p_branch_id UUID, p_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old JSONB;
  v_name TEXT := regexp_replace(p_name, '^[[:space:]]+|[[:space:]]+$', '', 'g');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'Branch name is required'; END IF;

  SELECT to_jsonb(b) INTO v_old FROM public.branches b
  WHERE b.id = p_branch_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF v_old->>'name' = v_name THEN RETURN; END IF;

  UPDATE public.branches SET name = v_name, updated_at = now() WHERE id = p_branch_id;
  PERFORM public.log_audit('UPDATE', 'branches', p_branch_id, v_old);
END $$;

REVOKE ALL ON FUNCTION public.rename_branch(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_branch(UUID, TEXT) TO authenticated;
