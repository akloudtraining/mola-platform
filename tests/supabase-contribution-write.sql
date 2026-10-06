-- Fictional-only regression coverage for the structured contribution write.
-- Every row is rolled back before the script completes.
BEGIN;

INSERT INTO mola_private.organizations(id, owner, data, version)
VALUES (
  'fictional-org',
  'supabase:fictional-owner',
  jsonb_build_object(
    'id', 'fictional-org',
    'name', 'Fictional Mola',
    'mode', 'Shared ownership',
    'currency', 'USD',
    'members', jsonb_build_array(
      jsonb_build_object(
        'id', 'member-1',
        'name', 'Fictional Member',
        'role', 'Founding member',
        'access', jsonb_build_object(
          'email', 'fictional@example.com',
          'enabled', true,
          'canReview', false,
          'userId', 'supabase:fictional-member'
        )
      ),
      jsonb_build_object(
        'id', 'member-2',
        'name', 'Other Fictional Member',
        'role', 'Founding member',
        'access', jsonb_build_object(
          'email', 'other@example.com',
          'enabled', true,
          'canReview', false,
          'userId', 'supabase:other-member'
        )
      )
    )
  )::text,
  1
);

INSERT INTO mola_private.entries(id, org_id, data, created, recorded_at)
VALUES (
  'fictional-org:obligation-1',
  'fictional-org',
  jsonb_build_object(
    'id', 'fictional-org:obligation-1',
    'orgId', 'fictional-org',
    'type', 'obligation',
    'title', 'Fictional weekly obligation',
    'memberId', 'member-1',
    'amountMinor', 10000,
    'currency', 'USD',
    'method', 'Scheduled obligation',
    'date', '2026-10-02',
    'reference', 'Fictional schedule',
    'purpose', 'Regression test only',
    'status', 'Recorded obligation',
    'created', '2026-10-01T00:00:00.000Z',
    'deadline', jsonb_build_object(
      'at', '2026-10-02T23:00:00.000Z',
      'localDateTime', '2026-10-02T18:00:00',
      'timeZone', 'America/New_York'
    )
  )::text,
  '2026-10-01T00:00:00.000Z',
  '2026-10-01T00:00:00.000Z'::timestamptz
);

DO $$
DECLARE
  first_result jsonb;
  retry_result jsonb;
  stored jsonb;
  denied boolean := false;
BEGIN
  first_result := public.mola_storage_submit_contribution(
    'supabase:fictional-member',
    jsonb_build_object(
      'org_id', 'fictional-org',
      'entry_id', 'fictional-org:00000000-0000-0000-0000-000000000001',
      'title', 'Fictional member contribution',
      'member_id', 'member-1',
      'amount_minor', 12345,
      'currency', 'USD',
      'method', 'Zelle (external)',
      'date', '2026-10-01',
      'reference', 'fictional-reference',
      'purpose', 'Regression test only',
      'submission_obligation_id', 'fictional-org:obligation-1',
      -- These caller-controlled fields must be ignored by the function.
      'status', 'Verified',
      'reviews', jsonb_build_array(jsonb_build_object('outcome', 'Verified'))
    )
  );
  IF (first_result ->> 'changes')::integer <> 1
     OR first_result -> 'entry' ->> 'status' <> 'Awaiting verification'
     OR first_result -> 'entry' ->> 'submittedBy' <> 'supabase:fictional-member'
     OR first_result -> 'entry' ->> 'submissionObligationId' <> 'fictional-org:obligation-1'
     OR first_result -> 'entry' -> 'submissionDeadline' ->> 'at' <> '2026-10-02T23:00:00.000Z'
     OR (first_result -> 'entry') ? 'reviews' THEN
    RAISE EXCEPTION 'first contribution write assertion failed';
  END IF;

  SELECT e.data::jsonb
    INTO stored
  FROM mola_private.entries e
  WHERE e.id = 'fictional-org:00000000-0000-0000-0000-000000000001';
  IF stored ->> 'status' <> 'Awaiting verification'
     OR stored ->> 'created' IS NULL
     OR stored ->> 'created' !~ 'Z$' THEN
    RAISE EXCEPTION 'stored contribution provenance assertion failed';
  END IF;

  retry_result := public.mola_storage_submit_contribution(
    'supabase:fictional-member',
    jsonb_build_object(
      'org_id', 'fictional-org',
      'entry_id', 'fictional-org:00000000-0000-0000-0000-000000000001',
      'title', 'Fictional member contribution',
      'member_id', 'member-1',
      'amount_minor', 12345,
      'currency', 'USD',
      'method', 'Zelle (external)',
      'date', '2026-10-01',
      'reference', 'fictional-reference',
      'purpose', 'Regression test only',
      'submission_obligation_id', 'fictional-org:obligation-1',
      'status', 'Rejected'
    )
  );
  IF (retry_result ->> 'changes')::integer <> 0
     OR retry_result -> 'entry' ->> 'status' <> 'Awaiting verification' THEN
    RAISE EXCEPTION 'idempotent retry assertion failed';
  END IF;

  BEGIN
    PERFORM public.mola_storage_submit_contribution(
      'supabase:fictional-member',
      jsonb_build_object(
        'org_id', 'fictional-org',
        'entry_id', 'fictional-org:00000000-0000-0000-0000-000000000002',
        'title', 'Wrong member contribution',
        'member_id', 'member-2',
        'amount_minor', 100,
        'currency', 'USD',
        'method', 'Zelle (external)',
        'date', '2026-10-01',
        'reference', 'wrong-member',
        'purpose', 'Regression test only'
      )
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'cross-member submission was not denied';
  END IF;
END;
$$;

DO $$
DECLARE
  entry_count integer;
BEGIN
  SELECT count(*) INTO entry_count
  FROM mola_private.entries
  WHERE org_id = 'fictional-org'
    AND id LIKE 'fictional-org:00000000-%';
  IF entry_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one contribution row, found %', entry_count;
  END IF;
END;
$$;

SELECT 'contribution write assertions passed; fictional rows rolled back' AS result;
ROLLBACK;

SELECT
  (SELECT count(*) FROM mola_private.organizations WHERE id = 'fictional-org') AS organizations,
  (SELECT count(*) FROM mola_private.entries WHERE org_id = 'fictional-org') AS entries;
