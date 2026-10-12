-- Original movement rows show their current state. Correction/deletion rows
-- remain immutable snapshots of each individual action. Never rewrite the
-- append-only journal to update the original row's presentation.
CREATE OR REPLACE FUNCTION public.list_financial_movement_events(p_limit INTEGER DEFAULT 50, p_cursor JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized to view movements'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  IF p_cursor IS NOT NULL AND (jsonb_typeof(p_cursor) <> 'object'
    OR p_cursor->>'at' IS NULL OR p_cursor->>'id' IS NULL) THEN RAISE EXCEPTION 'Invalid cursor'; END IF;
  SELECT COALESCE(jsonb_agg(row ORDER BY at DESC, id DESC), '[]'::JSONB) INTO v_rows FROM (
    SELECT e.occurred_at AS at, e.id, jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'recordId', e.record_id, 'branchId', e.branch_id,
      'branchName', e.branch_name, 'action', e.action, 'actorName', e.actor_name,
      'actorRole', e.actor_role, 'occurredAt', e.occurred_at, 'before', e.before_snapshot,
      'after', CASE WHEN e.action IN ('create', 'baseline')
        THEN COALESCE(public.financial_movement_snapshot(e.kind, e.record_id), e.after_snapshot)
        ELSE e.after_snapshot END,
      'reason', e.reason, 'legacy', e.legacy,
      'canManage', CASE WHEN e.kind = 'delivery' THEN EXISTS (
        SELECT 1 FROM public.deliveries d WHERE d.id = e.record_id AND d.deleted_at IS NULL)
        ELSE EXISTS (SELECT 1 FROM public.payments p WHERE p.id = e.record_id AND p.deleted_at IS NULL AND p.delivery_id IS NULL) END) AS row
    FROM public.financial_movement_events e
    WHERE p_cursor IS NULL OR (e.occurred_at, e.id) < ((p_cursor->>'at')::TIMESTAMPTZ, (p_cursor->>'id')::UUID)
    ORDER BY e.occurred_at DESC, e.id DESC LIMIT p_limit + 1
  ) page;
  RETURN v_rows;
END $$;
