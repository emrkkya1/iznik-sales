-- Email report delivery: recipient management, schedule configuration, audit
-- trail, and a private bucket for short-lived manually generated PDFs.

CREATE TYPE public.report_schedule_mode AS ENUM ('weekly', 'monthly', 'disabled');

CREATE TABLE public.report_email_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  schedule_mode public.report_schedule_mode NOT NULL DEFAULT 'disabled',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id)
);

INSERT INTO public.report_email_settings (singleton) VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  normalized_email TEXT GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_recipients_email_format CHECK (
    normalized_email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
  ),
  CONSTRAINT report_recipients_normalized_email_unique UNIQUE (normalized_email)
);

CREATE TABLE public.report_email_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
  report_type TEXT NOT NULL CHECK (report_type IN ('summary', 'branches', 'branch-detail')),
  period_start DATE,
  period_end DATE,
  artifact_path TEXT,
  requested_by UUID REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'partial_failure', 'failed', 'skipped')),
  error_message TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.report_email_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.report_email_runs(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.report_recipients(id),
  resend_email_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT report_email_attempts_unique_recipient UNIQUE (run_id, recipient_id)
);

ALTER TABLE public.report_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_email_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_email_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_email_settings_admin ON public.report_email_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY report_recipients_admin ON public.report_recipients FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY report_email_runs_admin ON public.report_email_runs FOR SELECT USING (public.is_admin());
CREATE POLICY report_email_attempts_admin ON public.report_email_attempts FOR SELECT USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.list_report_recipients()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'isEnabled', is_enabled,
      'createdAt', created_at, 'updatedAt', updated_at
    ) ORDER BY normalized_email)
    FROM public.report_recipients
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_report_email_settings()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN (SELECT jsonb_build_object('scheduleMode', schedule_mode, 'updatedAt', updated_at)
          FROM public.report_email_settings WHERE singleton);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_report_recipient(p_email TEXT, p_is_enabled BOOLEAN DEFAULT TRUE)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_email IS NULL OR lower(btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  INSERT INTO public.report_recipients (email, is_enabled, created_by)
  VALUES (lower(btrim(p_email)), coalesce(p_is_enabled, TRUE), auth.uid())
  ON CONFLICT (normalized_email) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_report_recipient(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.report_recipients WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_report_schedule_mode(p_mode public.report_schedule_mode)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.report_email_settings
  SET schedule_mode = p_mode, updated_at = now(), updated_by = auth.uid()
  WHERE singleton;
END;
$$;

-- The scheduled function runs with the service-role credential. Reuse the
-- admin-protected canonical summary snapshot by temporarily setting an active
-- admin subject inside this function; regular client roles receive no grant.
CREATE OR REPLACE FUNCTION public.report_summary_pdf_for_email(p_date_from DATE, p_date_to DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM public.users
    WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'No active admin is configured'; END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::TEXT, TRUE);
  RETURN public.report_summary_pdf('week', p_date_from, p_date_to, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.list_report_recipients() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_report_email_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_report_recipient(TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_report_recipient(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_report_schedule_mode(public.report_schedule_mode) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_summary_pdf_for_email(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_report_recipients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_email_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_report_recipient(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_report_recipient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_report_schedule_mode(public.report_schedule_mode) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_summary_pdf_for_email(DATE, DATE) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('report-artifacts', 'report-artifacts', FALSE, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY report_artifacts_admin_select ON storage.objects FOR SELECT
  USING (bucket_id = 'report-artifacts' AND public.is_admin());
CREATE POLICY report_artifacts_admin_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'report-artifacts' AND public.is_admin());
CREATE POLICY report_artifacts_admin_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'report-artifacts' AND public.is_admin());
