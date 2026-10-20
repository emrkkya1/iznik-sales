-- Financial invariants live in the checked, branch-serialized RPCs. M20's
-- fixture grants must not allow Data API clients to bypass those invariants.
-- Keep authorized reads and SECURITY DEFINER RPC writes unchanged.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.branches, public.deliveries, public.delivery_items,
    public.payments, public.audit_logs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.branches, public.deliveries, public.delivery_items,
  public.payments, public.audit_logs TO authenticated;

-- Fixtures/maintenance use a server-only client, never application credentials.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branches,
  public.deliveries, public.delivery_items, public.payments, public.audit_logs
  TO service_role;
-- Fresh Supabase schemas no longer auto-grant Data API privileges. Grant only
-- the reference tables needed by server-side provisioning and test fixtures.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users, public.cities,
  public.districts, public.products, public.branch_products,
  public.branch_product_prices TO service_role;

DROP POLICY staff_insert_own_deliveries ON public.deliveries;
DROP POLICY staff_update_own_deliveries ON public.deliveries;
DROP POLICY staff_insert_own_delivery_items ON public.delivery_items;

-- Defense in depth: a future accidental DML grant must not restore the old
-- permissive write policies. Preserve the previous admin SELECT visibility.
DROP POLICY admin_all_branches ON public.branches;
DROP POLICY admin_all_deliveries ON public.deliveries;
DROP POLICY admin_all_delivery_items ON public.delivery_items;
DROP POLICY admin_all_payments ON public.payments;
DROP POLICY admin_all_audit_logs ON public.audit_logs;
CREATE POLICY admin_select_branches ON public.branches FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_select_deliveries ON public.deliveries FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_select_delivery_items ON public.delivery_items FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_select_payments ON public.payments FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_select_audit_logs ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

-- Recalculation mutates cached balances and must not be a callable bypass of
-- the public wrappers' authorization, locking, and audit protocol.
REVOKE ALL ON FUNCTION public.recalculate_branch_balance(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_branch_balance(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.create_delivery_atomic_before_history(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT),
  public.edit_financial_delivery_items(UUID, JSONB, DATE),
  public.financial_movement_snapshot(TEXT, UUID),
  public.capture_financial_movement_audit(),
  public.log_audit(TEXT, TEXT, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_branch_balance(p_branch_id UUID)
RETURNS NUMERIC(12,2) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Not authorized to view branch balances';
  END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'Branch id is required'; END IF;
  RETURN (SELECT current_balance FROM public.branches WHERE id = p_branch_id);
END $$;
REVOKE ALL ON FUNCTION public.get_branch_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_balance(UUID) TO authenticated;
