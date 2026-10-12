-- A journal is not a second financial ledger: snapshots never affect balances.
CREATE TABLE public.financial_movement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('delivery', 'payment')),
  record_id UUID NOT NULL,
  branch_id UUID,
  branch_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'edit', 'delete', 'baseline')),
  actor_id UUID,
  actor_name TEXT NOT NULL,
  actor_role TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  before_snapshot JSONB,
  after_snapshot JSONB,
  reason TEXT,
  legacy BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX financial_movement_events_page ON public.financial_movement_events (occurred_at DESC, id DESC);
CREATE INDEX financial_movement_events_record ON public.financial_movement_events (kind, record_id);
ALTER TABLE public.financial_movement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_movement_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_movement_events TO service_role;

CREATE TABLE public.financial_movement_requests (
  key TEXT PRIMARY KEY,
  actor_id UUID NOT NULL,
  input JSONB NOT NULL,
  result JSONB NOT NULL
);
ALTER TABLE public.financial_movement_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_movement_requests FROM PUBLIC, anon, authenticated;

-- Canonical snapshots omit physical line IDs so an identical save is a no-op.
CREATE FUNCTION public.financial_movement_snapshot(p_kind TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result JSONB;
BEGIN
  IF p_kind = 'delivery' THEN
    SELECT jsonb_build_object('date', d.date, 'amount', d.total_sales_amount,
      'deleted', d.deleted_at IS NOT NULL,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'productId', i.product_id, 'productName', COALESCE(p.name, 'Bilinmeyen ürün'),
        'deliveredQuantity', i.delivered_quantity, 'returnedQuantity', i.returned_quantity,
        'unitPrice', i.unit_price) ORDER BY i.product_id)
        FROM public.delivery_items i LEFT JOIN public.products p ON p.id = i.product_id
        WHERE i.delivery_id = d.id), '[]'::JSONB),
      'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id,
        'amount', p.amount, 'paymentType', p.payment_type, 'date', p.date) ORDER BY p.id)
        FROM public.payments p WHERE p.delivery_id = d.id AND p.deleted_at IS NULL), '[]'::JSONB))
    INTO v_result FROM public.deliveries d WHERE d.id = p_id;
  ELSIF p_kind = 'payment' THEN
    SELECT jsonb_build_object('date', p.date, 'amount', p.amount,
      'deleted', p.deleted_at IS NOT NULL, 'paymentType', p.payment_type,
      'items', '[]'::JSONB, 'payments', '[]'::JSONB)
    INTO v_result FROM public.payments p WHERE p.id = p_id AND p.delivery_id IS NULL;
  END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.financial_movement_snapshot(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Existing creation RPCs log after all items/payments are committed. Capture
-- their composite delivery once, rather than counting its collection twice.
CREATE FUNCTION public.capture_financial_movement_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_kind TEXT; v_branch UUID; v_snapshot JSONB; v_before JSONB;
BEGIN
  IF NEW.table_name NOT IN ('deliveries', 'payments') THEN RETURN NEW; END IF;
  v_kind := CASE WHEN NEW.table_name = 'deliveries' THEN 'delivery' ELSE 'payment' END;
  v_snapshot := public.financial_movement_snapshot(v_kind, NEW.record_id);
  IF v_snapshot IS NULL THEN RETURN NEW; END IF;
  IF v_kind = 'delivery' THEN
    SELECT branch_id INTO v_branch FROM public.deliveries WHERE id = NEW.record_id;
  ELSE
    SELECT branch_id INTO v_branch FROM public.payments WHERE id = NEW.record_id;
  END IF;
  v_before := NEW.old_data->'movementSnapshot';
  IF v_before IS NOT NULL AND v_before = v_snapshot THEN RETURN NEW; END IF;
  INSERT INTO public.financial_movement_events
    (kind, record_id, branch_id, branch_name, action, actor_id, actor_name, actor_role,
     before_snapshot, after_snapshot, reason)
  SELECT v_kind, NEW.record_id, v_branch, COALESCE(b.name, 'Bilinmeyen şube'),
    CASE NEW.operation_type WHEN 'INSERT' THEN 'create' WHEN 'DELETE' THEN 'delete' ELSE 'edit' END,
    NEW.user_id, COALESCE(u.full_name, 'Bilinmeyen kullanıcı'), u.role,
    v_before, v_snapshot, NEW.deletion_reason
  FROM (SELECT 1) seed LEFT JOIN public.users u ON u.id = NEW.user_id
    LEFT JOIN public.branches b ON b.id = v_branch;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_financial_movement_audit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_financial_movement_audit AFTER INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.capture_financial_movement_audit();

-- Serialize staff creation with admin corrections and bulk settlement before
-- inserting any rows. Keep the existing creation contract/idempotency logic.
ALTER FUNCTION public.create_delivery_atomic(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT)
  RENAME TO create_delivery_atomic_before_history;
REVOKE ALL ON FUNCTION public.create_delivery_atomic_before_history(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT)
  FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.create_delivery_atomic(p_branch_id UUID, p_items JSONB,
  p_payment_amount NUMERIC, p_payment_type TEXT, p_date DATE, p_idempotency_key TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Not authorized to create deliveries';
  END IF;
  PERFORM id FROM public.branches WHERE id = p_branch_id FOR UPDATE;
  RETURN public.create_delivery_atomic_before_history(p_branch_id, p_items, p_payment_amount,
    p_payment_type, p_date, p_idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.create_delivery_atomic(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_delivery_atomic(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT) TO authenticated;

-- Do not manufacture past product snapshots. Existing records are explicitly
-- labelled as migration baselines (their original business date is retained).
INSERT INTO public.financial_movement_events
  (kind, record_id, branch_id, branch_name, action, actor_id, actor_name, actor_role,
   occurred_at, after_snapshot, legacy)
SELECT 'delivery', d.id, d.branch_id, COALESCE(b.name, 'Bilinmeyen şube'), 'baseline',
  d.user_id, COALESCE(u.full_name, 'Bilinmeyen kullanıcı'), u.role,
  COALESCE(d.created_at, now()), public.financial_movement_snapshot('delivery', d.id), true
FROM public.deliveries d LEFT JOIN public.branches b ON b.id = d.branch_id
LEFT JOIN public.users u ON u.id = d.user_id
UNION ALL
SELECT 'payment', p.id, p.branch_id, COALESCE(b.name, 'Bilinmeyen şube'), 'baseline',
  p.user_id, COALESCE(u.full_name, 'Bilinmeyen kullanıcı'), u.role,
  COALESCE(p.created_at, now()), public.financial_movement_snapshot('payment', p.id), true
FROM public.payments p LEFT JOIN public.branches b ON b.id = p.branch_id
LEFT JOIN public.users u ON u.id = p.user_id WHERE p.delivery_id IS NULL;

-- Preserve the old audit events too, but only the facts they actually stored.
-- Old logs have no product lines or after image: those must remain unknown.
INSERT INTO public.financial_movement_events
  (kind, record_id, branch_id, branch_name, action, actor_id, actor_name, actor_role,
   occurred_at, before_snapshot, reason, legacy)
SELECT CASE a.table_name WHEN 'deliveries' THEN 'delivery' ELSE 'payment' END,
  a.record_id, b.id, COALESCE(b.name, 'Bilinmeyen şube'),
  CASE a.operation_type WHEN 'DELETE' THEN 'delete' ELSE 'edit' END,
  a.user_id, COALESCE(u.full_name, 'Bilinmeyen kullanıcı'), u.role, COALESCE(a.created_at, now()),
  jsonb_build_object('date', a.old_data->>'date',
    'amount', COALESCE(a.old_data->'total_sales_amount', a.old_data->'amount'),
    'deleted', false, 'items', '[]'::JSONB, 'payments', '[]'::JSONB)
    || CASE WHEN a.table_name = 'payments' THEN jsonb_build_object('paymentType', a.old_data->>'payment_type') ELSE '{}'::JSONB END,
  a.deletion_reason, true
FROM public.audit_logs a
LEFT JOIN public.branches b ON b.id = (a.old_data->>'branch_id')::UUID
LEFT JOIN public.users u ON u.id = a.user_id
WHERE a.table_name IN ('deliveries', 'payments') AND a.operation_type IN ('UPDATE', 'DELETE')
  AND a.old_data->>'date' IS NOT NULL
  AND COALESCE(a.old_data->>'total_sales_amount', a.old_data->>'amount') IS NOT NULL
  AND (a.table_name = 'deliveries' OR a.old_data->>'delivery_id' IS NULL);

-- Shared item editor used by both staff's existing RPC and the new admin RPC.
-- Preserve historical prices for retained products; only newly added products
-- use the effective price on the requested business date.
CREATE FUNCTION public.edit_financial_delivery_items(p_id UUID, p_items JSONB, p_date DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch UUID; v_item JSONB; v_product UUID; v_bp UUID; v_price NUMERIC;
  v_old_prices JSONB; v_total NUMERIC := 0;
BEGIN
  IF p_date IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid delivery input';
  END IF;
  IF jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Select between 1 and 200 products';
  END IF;
  SELECT branch_id INTO v_branch FROM public.deliveries WHERE id = p_id;
  SELECT jsonb_object_agg(product_id::TEXT, unit_price) INTO v_old_prices
  FROM public.delivery_items WHERE delivery_id = p_id;
  IF (SELECT count(DISTINCT value->>'product_id') FROM jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Duplicate product';
  END IF;
  DELETE FROM public.delivery_items WHERE delivery_id = p_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item->'product_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_item->'delivered_quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_item->'returned_quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid product quantities';
    END IF;
    IF (v_item->>'delivered_quantity')::NUMERIC < 0 OR (v_item->>'returned_quantity')::NUMERIC < 0
      OR (v_item->>'delivered_quantity')::NUMERIC >= 10000000000
      OR (v_item->>'returned_quantity')::NUMERIC >= 10000000000
      OR (v_item->>'delivered_quantity')::NUMERIC <> round((v_item->>'delivered_quantity')::NUMERIC, 2)
      OR (v_item->>'returned_quantity')::NUMERIC <> round((v_item->>'returned_quantity')::NUMERIC, 2) THEN
      RAISE EXCEPTION 'Invalid product quantities';
    END IF;
    v_product := (v_item->>'product_id')::UUID;
    v_price := (v_old_prices->>v_product::TEXT)::NUMERIC;
    IF v_price IS NULL THEN
      SELECT id INTO v_bp FROM public.branch_products
      WHERE branch_id = v_branch AND product_id = v_product AND is_active;
      IF v_bp IS NULL THEN RAISE EXCEPTION 'Product not available at this branch'; END IF;
      v_price := public.get_effective_price(v_bp, p_date);
      IF v_price IS NULL THEN RAISE EXCEPTION 'No price found for product on date %', p_date; END IF;
    END IF;
    INSERT INTO public.delivery_items (delivery_id, product_id, delivered_quantity, returned_quantity, unit_price)
    VALUES (p_id, v_product, (v_item->>'delivered_quantity')::NUMERIC,
      (v_item->>'returned_quantity')::NUMERIC, v_price);
    v_total := v_total + ((v_item->>'delivered_quantity')::NUMERIC - (v_item->>'returned_quantity')::NUMERIC) * v_price;
  END LOOP;
  UPDATE public.deliveries SET date = p_date, total_sales_amount = v_total, updated_at = clock_timestamp() WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.edit_financial_delivery_items(UUID, JSONB, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_delivery_atomic(p_delivery_id UUID, p_items JSONB, p_date DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.deliveries%ROWTYPE; v_before JSONB; v_branch UUID;
BEGIN
  SELECT branch_id INTO v_branch FROM public.deliveries WHERE id = p_delivery_id;
  PERFORM id FROM public.branches WHERE id = v_branch FOR UPDATE;
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND OR v_row.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Delivery not found or already deleted'; END IF;
  IF NOT public.is_admin() THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role = 'staff')
      OR v_row.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized to edit this delivery'; END IF;
    IF v_row.date <> (now() AT TIME ZONE 'Europe/Istanbul')::DATE
      OR p_date IS DISTINCT FROM v_row.date THEN RAISE EXCEPTION 'Staff can only edit today''s deliveries'; END IF;
    IF (now() AT TIME ZONE 'Europe/Istanbul')::TIME >= '23:59:00' THEN RAISE EXCEPTION 'Edit deadline has passed'; END IF;
  END IF;
  v_before := public.financial_movement_snapshot('delivery', p_delivery_id);
  PERFORM public.edit_financial_delivery_items(p_delivery_id, p_items, p_date);
  IF v_before = public.financial_movement_snapshot('delivery', p_delivery_id) THEN RETURN; END IF;
  PERFORM public.recalculate_branch_balance(v_branch);
  PERFORM public.log_audit('UPDATE', 'deliveries', p_delivery_id,
    to_jsonb(v_row) || jsonb_build_object('movementSnapshot', v_before));
END $$;

CREATE OR REPLACE FUNCTION public.soft_delete_delivery_atomic(p_delivery_id UUID, p_deletion_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.deliveries%ROWTYPE; v_before JSONB; v_branch UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized to delete deliveries'; END IF;
  IF p_deletion_reason IS NULL OR btrim(p_deletion_reason) = '' THEN RAISE EXCEPTION 'Deletion reason is required'; END IF;
  SELECT branch_id INTO v_branch FROM public.deliveries WHERE id = p_delivery_id;
  PERFORM id FROM public.branches WHERE id = v_branch FOR UPDATE;
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND OR v_row.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Delivery not found or already deleted'; END IF;
  v_before := public.financial_movement_snapshot('delivery', p_delivery_id);
  UPDATE public.deliveries SET deleted_at = clock_timestamp(), deleted_by = auth.uid(), deletion_reason = p_deletion_reason WHERE id = p_delivery_id;
  UPDATE public.payments SET deleted_at = clock_timestamp(), deleted_by = auth.uid(), deletion_reason = p_deletion_reason
  WHERE delivery_id = p_delivery_id AND deleted_at IS NULL;
  PERFORM public.recalculate_branch_balance(v_branch);
  PERFORM public.log_audit('DELETE', 'deliveries', p_delivery_id,
    to_jsonb(v_row) || jsonb_build_object('movementSnapshot', v_before), p_deletion_reason);
END $$;

CREATE FUNCTION public.list_financial_movement_events(p_limit INTEGER DEFAULT 50, p_cursor JSONB DEFAULT NULL)
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
      'after', e.after_snapshot, 'reason', e.reason, 'legacy', e.legacy,
      'canManage', CASE WHEN e.kind = 'delivery' THEN EXISTS (
        SELECT 1 FROM public.deliveries d WHERE d.id = e.record_id AND d.deleted_at IS NULL)
        ELSE EXISTS (SELECT 1 FROM public.payments p WHERE p.id = e.record_id AND p.deleted_at IS NULL AND p.delivery_id IS NULL) END) AS row
    FROM public.financial_movement_events e
    WHERE p_cursor IS NULL OR (e.occurred_at, e.id) < ((p_cursor->>'at')::TIMESTAMPTZ, (p_cursor->>'id')::UUID)
    ORDER BY e.occurred_at DESC, e.id DESC LIMIT p_limit + 1
  ) page;
  RETURN v_rows;
END $$;

CREATE FUNCTION public.get_financial_movement(p_kind TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_snapshot JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized to view movements'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('delivery', 'payment') THEN RAISE EXCEPTION 'Invalid movement type'; END IF;
  v_snapshot := public.financial_movement_snapshot(p_kind, p_id);
  IF v_snapshot IS NULL OR (v_snapshot->>'deleted')::BOOLEAN THEN RAISE EXCEPTION 'Movement not found or deleted'; END IF;
  RETURN jsonb_build_object('snapshot', v_snapshot, 'version', md5(v_snapshot::TEXT));
END $$;

CREATE FUNCTION public.change_financial_movement(p_kind TEXT, p_id UUID, p_action TEXT,
  p_patch JSONB, p_version TEXT, p_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch UUID; v_before JSONB; v_after JSONB; v_request public.financial_movement_requests%ROWTYPE;
  v_input JSONB; v_result JSONB; v_payment JSONB; v_amount NUMERIC; v_date DATE;
  v_old JSONB; v_payment_id UUID; v_reason TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized to change movements'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('delivery', 'payment') OR p_action IS NULL OR p_action NOT IN ('edit', 'delete')
    OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
    OR p_version IS NULL OR p_key IS NULL OR btrim(p_key) = '' THEN RAISE EXCEPTION 'Invalid movement input'; END IF;
  v_input := jsonb_build_object('kind', p_kind, 'id', p_id, 'action', p_action, 'patch', p_patch, 'version', p_version);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financial_movement:' || p_key, 0));
  SELECT * INTO v_request FROM public.financial_movement_requests WHERE key = p_key;
  IF FOUND THEN
    IF v_request.actor_id <> auth.uid() OR v_request.input <> v_input THEN RAISE EXCEPTION 'Retry key belongs to another request'; END IF;
    RETURN v_request.result;
  END IF;
  IF p_kind = 'delivery' THEN SELECT branch_id INTO v_branch FROM public.deliveries WHERE id = p_id;
  ELSE SELECT branch_id INTO v_branch FROM public.payments WHERE id = p_id AND delivery_id IS NULL; END IF;
  PERFORM id FROM public.branches WHERE id = v_branch FOR UPDATE;
  IF p_kind = 'delivery' THEN PERFORM id FROM public.deliveries WHERE id = p_id FOR UPDATE;
  ELSE PERFORM id FROM public.payments WHERE id = p_id FOR UPDATE; END IF;
  v_before := public.financial_movement_snapshot(p_kind, p_id);
  IF v_before IS NULL OR (v_before->>'deleted')::BOOLEAN THEN RAISE EXCEPTION 'Movement not found or deleted'; END IF;
  IF md5(v_before::TEXT) <> p_version THEN RAISE EXCEPTION 'Movement changed. Reopen and try again.'; END IF;
  IF p_action = 'delete' THEN
    v_reason := btrim(p_patch->>'reason');
    IF v_reason IS NULL OR v_reason = '' OR length(v_reason) > 1000 THEN RAISE EXCEPTION 'Deletion reason is required (maximum 1000 characters)'; END IF;
    IF p_kind = 'delivery' THEN
      PERFORM public.soft_delete_delivery_atomic(p_id, v_reason);
    ELSE
      SELECT to_jsonb(p) INTO v_old FROM public.payments p WHERE id = p_id;
      UPDATE public.payments SET deleted_at = clock_timestamp(), deleted_by = auth.uid(), deletion_reason = v_reason WHERE id = p_id;
      PERFORM public.log_audit('DELETE', 'payments', p_id, v_old || jsonb_build_object('movementSnapshot', v_before), v_reason);
    END IF;
  ELSE
    v_date := (p_patch->>'date')::DATE;
    IF v_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
    IF p_kind = 'delivery' THEN
      SELECT to_jsonb(d) INTO v_old FROM public.deliveries d WHERE id = p_id;
      PERFORM public.edit_financial_delivery_items(p_id, p_patch->'items', v_date);
      IF jsonb_typeof(p_patch->'payments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Payments must be an array'; END IF;
      -- Existing linked collections cannot be silently omitted or reassigned.
      IF EXISTS (SELECT 1 FROM public.payments p WHERE p.delivery_id = p_id AND p.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_patch->'payments') entry WHERE entry->>'id' = p.id::TEXT)) THEN
        RAISE EXCEPTION 'Missing linked payment';
      END IF;
      IF jsonb_array_length(p_patch->'payments') > 100 OR
        (SELECT count(*) FROM jsonb_array_elements(p_patch->'payments') entry WHERE entry->>'id' IS NULL) > 1 OR
        (SELECT count(entry->>'id') - count(DISTINCT entry->>'id') FROM jsonb_array_elements(p_patch->'payments') entry) > 0 THEN
        RAISE EXCEPTION 'Invalid linked payments';
      END IF;
      FOR v_payment IN SELECT value FROM jsonb_array_elements(p_patch->'payments') LOOP
        IF jsonb_typeof(v_payment->'amount') IS DISTINCT FROM 'number' OR v_payment->>'paymentType' IS NULL
          OR v_payment->>'paymentType' NOT IN ('field_collection', 'bank_transfer') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
        v_amount := (v_payment->>'amount')::NUMERIC;
        IF v_amount < 0 OR v_amount >= 10000000000 OR v_amount <> round(v_amount, 2) THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
        v_payment_id := (v_payment->>'id')::UUID;
        IF v_payment_id IS NULL THEN
          IF v_amount > 0 THEN INSERT INTO public.payments (branch_id, user_id, delivery_id, amount, payment_type, date)
            VALUES (v_branch, auth.uid(), p_id, v_amount, v_payment->>'paymentType', v_date); END IF;
        ELSE
          IF NOT EXISTS (SELECT 1 FROM public.payments WHERE id = v_payment_id AND delivery_id = p_id AND deleted_at IS NULL) THEN
            RAISE EXCEPTION 'Linked payment not found';
          END IF;
          UPDATE public.payments SET amount = CASE WHEN v_amount = 0 THEN amount ELSE v_amount END,
            payment_type = v_payment->>'paymentType', date = v_date,
            deleted_at = CASE WHEN v_amount = 0 THEN clock_timestamp() ELSE NULL END,
            deleted_by = CASE WHEN v_amount = 0 THEN auth.uid() ELSE NULL END,
            deletion_reason = CASE WHEN v_amount = 0 THEN 'Teslimat düzenlemesinde tahsilat kaldırıldı' ELSE NULL END
          WHERE id = v_payment_id;
        END IF;
      END LOOP;
    ELSE
      IF jsonb_typeof(p_patch->'amount') IS DISTINCT FROM 'number' OR p_patch->>'paymentType' IS NULL
        OR p_patch->>'paymentType' NOT IN ('field_collection', 'bank_transfer') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
      v_amount := (p_patch->>'amount')::NUMERIC;
      IF v_amount <= 0 OR v_amount >= 10000000000 OR v_amount <> round(v_amount, 2) THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
      SELECT to_jsonb(p) INTO v_old FROM public.payments p WHERE id = p_id;
      UPDATE public.payments SET amount = v_amount, date = v_date, payment_type = p_patch->>'paymentType' WHERE id = p_id;
    END IF;
    v_after := public.financial_movement_snapshot(p_kind, p_id);
    IF v_after <> v_before THEN
      PERFORM public.log_audit('UPDATE', CASE p_kind WHEN 'delivery' THEN 'deliveries' ELSE 'payments' END,
        p_id, v_old || jsonb_build_object('movementSnapshot', v_before));
    END IF;
  END IF;
  PERFORM public.recalculate_branch_balance(v_branch);
  v_after := public.financial_movement_snapshot(p_kind, p_id);
  v_result := jsonb_build_object('changed', v_after <> v_before);
  INSERT INTO public.financial_movement_requests VALUES (p_key, auth.uid(), v_input, v_result);
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.list_financial_movement_events(INTEGER, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_financial_movement(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_financial_movement(TEXT, UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_financial_movement_events(INTEGER, JSONB),
  public.get_financial_movement(TEXT, UUID), public.change_financial_movement(TEXT, UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;
-- Internal auditing must not be callable as a public RPC (forged events).
REVOKE ALL ON FUNCTION public.log_audit(TEXT, TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
