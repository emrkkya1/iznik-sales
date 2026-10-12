-- All dashboard and summary PDF RPCs share this range resolver.
-- Daily means the current Istanbul business date, not the last 24 hours.
CREATE OR REPLACE FUNCTION public._summary_range(p_range TEXT)
RETURNS TABLE(start_date DATE, end_date DATE, granularity TEXT) AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_min_date DATE;
  v_span_days INT;
BEGIN
  IF p_range = 'day' THEN
    start_date := v_today;
    end_date := v_today;
    granularity := 'day';
    RETURN NEXT;
  ELSIF p_range = 'week' THEN
    start_date := date_trunc('week', v_today)::DATE;
    end_date := v_today;
    granularity := 'day';
    RETURN NEXT;
  ELSIF p_range = 'month' THEN
    start_date := date_trunc('month', v_today)::DATE;
    end_date := v_today;
    granularity := 'day';
    RETURN NEXT;
  ELSIF p_range = 'all' THEN
    SELECT COALESCE(MIN(date), v_today) INTO v_min_date
    FROM public.deliveries WHERE deleted_at IS NULL;
    start_date := v_min_date;
    end_date := v_today;
    v_span_days := v_today - v_min_date;
    granularity := CASE
      WHEN v_span_days <= 90 THEN 'day'
      WHEN v_span_days <= 730 THEN 'week'
      ELSE 'month'
    END;
    RETURN NEXT;
  ELSE
    RAISE EXCEPTION 'Invalid range: %', p_range;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = '';
