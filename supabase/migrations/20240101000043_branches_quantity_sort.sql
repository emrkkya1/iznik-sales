-- Extend the existing list/report ordering without changing their filters,
-- aggregates, signatures, or privileges. Fail if the expected definitions have
-- drifted rather than silently shipping a partially updated sort contract.
DO $migration$
DECLARE
  target regprocedure;
  definition text;
  validation text := '''name'', ''balance'', ''return_rate'', ''last_activity'', ''location''';
  ordering text := 'CASE WHEN v_sort_by = ''return_rate'' AND v_sort_dir = ''asc''';
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.list_branches_analytics(text,text,date,date,smallint[],uuid,uuid,text,text,integer,integer)'::regprocedure,
    'public.report_branches_pdf(text,text,date,date,smallint[],uuid,uuid,text,text,uuid[])'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(target);
    IF strpos(definition, validation) = 0 OR strpos(definition, ordering) = 0 THEN
      RAISE EXCEPTION 'Unexpected definition for %', target;
    END IF;
    definition := replace(definition, validation,
      '''name'', ''balance'', ''delivered_qty'', ''returned_qty'', ''return_rate'', ''last_activity'', ''location''');
    definition := replace(definition, ordering,
      'CASE WHEN v_sort_by = ''delivered_qty'' AND v_sort_dir = ''asc'' THEN delivered_qty END ASC,
       CASE WHEN v_sort_by = ''delivered_qty'' AND v_sort_dir = ''desc'' THEN delivered_qty END DESC,
       CASE WHEN v_sort_by = ''returned_qty'' AND v_sort_dir = ''asc'' THEN returned_qty END ASC,
       CASE WHEN v_sort_by = ''returned_qty'' AND v_sort_dir = ''desc'' THEN returned_qty END DESC,
       ' || ordering);
    EXECUTE definition;
  END LOOP;
END;
$migration$;
