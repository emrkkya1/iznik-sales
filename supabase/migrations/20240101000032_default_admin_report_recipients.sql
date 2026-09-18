-- Keep report recipients convenient without taking control away from Settings:
-- active admins are added when created/promoted, but an existing recipient is
-- never re-enabled or deleted by this automation.

-- M31's escaped-dot regex is interpreted differently by PostgreSQL's regex
-- engine than JavaScript. Use a character class for a literal dot instead.
ALTER TABLE public.report_recipients
  DROP CONSTRAINT report_recipients_email_format,
  ADD CONSTRAINT report_recipients_email_format CHECK (
    normalized_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  );

CREATE OR REPLACE FUNCTION public.upsert_report_recipient(p_email TEXT, p_is_enabled BOOLEAN DEFAULT TRUE)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_email IS NULL OR lower(btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
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

CREATE OR REPLACE FUNCTION public.add_admin_report_recipient()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email TEXT;
BEGIN
  IF NEW.role <> 'admin' OR NOT NEW.is_active THEN
    RETURN NEW;
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;
  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.report_recipients (email, is_enabled, created_by)
  VALUES (lower(btrim(v_email)), TRUE, NEW.id)
  ON CONFLICT (normalized_email) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER add_admin_report_recipient_after_user_change
AFTER INSERT OR UPDATE OF role, is_active ON public.users
FOR EACH ROW EXECUTE FUNCTION public.add_admin_report_recipient();

INSERT INTO public.report_recipients (email, is_enabled, created_by)
SELECT lower(btrim(auth.email)), TRUE, u.id
FROM public.users u
JOIN auth.users auth ON auth.id = u.id
WHERE u.role = 'admin' AND u.is_active AND auth.email IS NOT NULL AND btrim(auth.email) <> ''
ON CONFLICT (normalized_email) DO NOTHING;
