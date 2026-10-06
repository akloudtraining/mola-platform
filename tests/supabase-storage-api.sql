BEGIN;

DO $test$
DECLARE
  snapshot jsonb;
  result jsonb;
  organization_data text := '{"id":"__storage_api_org__","name":"Fictional test org","members":[]}';
  entry_data text := '{"id":"__storage_api_entry__","orgId":"__storage_api_org__","created":"2026-10-01T20:00:00.000Z","type":"note","title":"Fictional test","memberId":"member","amountMinor":0,"currency":"USD","method":"test","date":"2026-10-01","reference":"test","purpose":"rollback","status":"Draft"}';
BEGIN
  result := public.mola_storage_mutate(
    'supabase:fictional-user',
    'bootstrap',
    jsonb_build_object(
      'owner', 'supabase:fictional-user',
      'organizations', jsonb_build_array(organization_data::jsonb)
    )
  );
  IF (result ->> 'inserted')::integer <> 1 THEN RAISE EXCEPTION 'Bootstrap did not insert exactly one organization'; END IF;

  result := public.mola_storage_mutate(
    'supabase:fictional-user',
    'entry_insert',
    jsonb_build_object(
      'org_id', '__storage_api_org__',
      'entry_id', '__storage_api_entry__',
      'created', '2026-10-01T20:00:00.000Z',
      'data', entry_data
    )
  );
  IF (result ->> 'changes')::integer <> 1 THEN RAISE EXCEPTION 'Entry insert did not change one row'; END IF;

  snapshot := public.mola_storage_read('supabase:fictional-user');
  IF jsonb_array_length(snapshot -> 'organizations') <> 1 THEN RAISE EXCEPTION 'Read did not return one organization'; END IF;
  IF jsonb_array_length(snapshot -> 'entries') <> 1 THEN RAISE EXCEPTION 'Read did not return one entry'; END IF;

  result := public.mola_storage_mutate(
    'supabase:fictional-user',
    'mark_read',
    jsonb_build_object('org_id', '__storage_api_org__', 'event_ids', jsonb_build_array('fictional-event'))
  );
  IF (result ->> 'inserted')::integer <> 1 THEN RAISE EXCEPTION 'Read state did not insert one row'; END IF;

  result := public.mola_storage_mutate(
    'supabase:fictional-user',
    'mark_read',
    jsonb_build_object('org_id', '__storage_api_org__', 'event_ids', jsonb_build_array('fictional-event'))
  );
  IF (result ->> 'inserted')::integer <> 0 THEN RAISE EXCEPTION 'Duplicate read state was not ignored'; END IF;
END;
$test$;

ROLLBACK;
SELECT 'storage API assertions passed; fictional rows rolled back' AS result,
  (SELECT count(*) FROM mola_private.organizations) AS organizations,
  (SELECT count(*) FROM mola_private.entries) AS entries,
  (SELECT count(*) FROM mola_private.notification_reads) AS notification_reads;
