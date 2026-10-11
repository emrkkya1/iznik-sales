-- Financial RPCs are exposed only to authenticated application sessions.
-- PostgreSQL grants EXECUTE to PUBLIC by default; granting authenticated alone
-- does not revoke that implicit anonymous access.
REVOKE ALL ON FUNCTION public.create_delivery_atomic(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_delivery_atomic(UUID, JSONB, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_delivery_atomic(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_manual_payment_atomic(UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_delivery_atomic(UUID, JSONB, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_atomic(UUID, JSONB, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_delivery_atomic(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_payment_atomic(UUID, NUMERIC, TEXT, DATE) TO authenticated;
