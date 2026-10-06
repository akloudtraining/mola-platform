-- Fictional-only regression coverage for the structured review write.
-- Every row is rolled back before the script completes.
BEGIN;

INSERT INTO mola_private.organizations(id, owner, data, version)
VALUES (
  'review-org',
  'supabase:review-owner',
  jsonb_build_object(
    'id', 'review-org',
    'name', 'Review Test Organization',
    'mode', 'Shared ownership',
    'currency', 'USD',
    'members', jsonb_build_array(
      jsonb_build_object(
        'id', 'member-1',
        'name', 'Submitting Member',
        'role', 'Founding member',
        'access', jsonb_build_object(
          'email', 'submitter@example.com',
          'enabled', true,
          'canReview', false,
          'userId', 'supabase:review-submitter'
        )
      ),
      jsonb_build_object(
        'id', 'member-2',
        'name', 'Independent Reviewer',
        'role', 'Designated reviewer',
        'access', jsonb_build_object(
          'email', 'reviewer@example.com',
          'enabled', true,
          'canReview', true,
          'userId', 'supabase:reviewer'
        )
      )
    )
  )::text,
  1
);

INSERT INTO mola_private.entries(id, org_id, data, created, recorded_at)
VALUES (
  'review-org:obligation-1',
  'review-org',
  jsonb_build_object(
    'id', 'review-org:obligation-1',
    'orgId', 'review-org',
    'type', 'obligation',
    'title', 'Review-cycle obligation',
    'memberId', 'member-1',
    'amountMinor', 20000,
    'currency', 'USD',
    'method', 'Scheduled obligation',
    'date', '2026-10-02',
    'reference', 'Review schedule',
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
  contribution_result jsonb;
  own_contribution_result jsonb;
  review_result jsonb;
  stored jsonb;
  denied boolean := false;
BEGIN
  contribution_result := public.mola_storage_submit_contribution(
    'supabase:review-submitter',
    jsonb_build_object(
      'org_id', 'review-org',
      'entry_id', 'review-org:00000000-0000-0000-0000-000000000001',
      'title', 'Review-cycle contribution',
      'member_id', 'member-1',
      'amount_minor', 12345,
      'currency', 'USD',
      'method', 'Bank transfer (external)',
      'date', '2026-10-01',
      'reference', 'review-reference',
      'purpose', 'Regression test only',
      'submission_obligation_id', 'review-org:obligation-1'
    )
  );
  IF (contribution_result ->> 'changes')::integer <> 1 THEN
    RAISE EXCEPTION 'contribution setup failed';
  END IF;

  review_result := public.mola_storage_review_contribution(
    'supabase:reviewer',
    jsonb_build_object(
      'org_id', 'review-org',
      'entry_id', 'review-org:00000000-0000-0000-0000-000000000001',
      'review_count', 0,
      'outcome', 'Verified',
      'evidence', 'Fictional receiving-account evidence',
      'obligation_id', 'review-org:obligation-1',
      'credit_minor', 12345,
      'status', 'Rejected',
      'reviews', jsonb_build_array(jsonb_build_object('outcome', 'Rejected'))
    )
  );
  IF (review_result ->> 'changes')::integer <> 1
     OR review_result -> 'entry' ->> 'status' <> 'Verified'
     OR jsonb_array_length(review_result -> 'entry' -> 'reviews') <> 1
     OR review_result -> 'entry' -> 'reviews' -> 0 ->> 'actor' <> 'supabase:reviewer'
     OR review_result -> 'entry' -> 'reviews' -> 0 ->> 'creditMinor' <> '12345'
     OR review_result -> 'entry' -> 'submissionDeadline' ->> 'at' <> '2026-10-02T23:00:00.000Z' THEN
    RAISE EXCEPTION 'independent review assertion failed';
  END IF;

  SELECT e.data::jsonb
    INTO stored
  FROM mola_private.entries e
  WHERE e.id = 'review-org:00000000-0000-0000-0000-000000000001';
  IF stored ->> 'submittedBy' <> 'supabase:review-submitter'
     OR stored ->> 'status' <> 'Verified' THEN
    RAISE EXCEPTION 'review provenance assertion failed';
  END IF;

  BEGIN
    PERFORM public.mola_storage_review_contribution(
      'supabase:reviewer',
      jsonb_build_object(
        'org_id', 'review-org',
        'entry_id', 'review-org:00000000-0000-0000-0000-000000000001',
        'review_count', 0,
        'outcome', 'Verified',
        'evidence', 'Stale review attempt'
      )
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'stale review was not denied';
  END IF;

  own_contribution_result := public.mola_storage_submit_contribution(
    'supabase:reviewer',
    jsonb_build_object(
      'org_id', 'review-org',
      'entry_id', 'review-org:00000000-0000-0000-0000-000000000002',
      'title', 'Reviewer own contribution',
      'member_id', 'member-2',
      'amount_minor', 100,
      'currency', 'USD',
      'method', 'Other external payment',
      'date', '2026-10-01',
      'reference', 'reviewer-own-reference',
      'purpose', 'Regression test only'
    )
  );
  IF (own_contribution_result ->> 'changes')::integer <> 1 THEN
    RAISE EXCEPTION 'reviewer contribution setup failed';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.mola_storage_review_contribution(
      'supabase:reviewer',
      jsonb_build_object(
        'org_id', 'review-org',
        'entry_id', 'review-org:00000000-0000-0000-0000-000000000002',
        'review_count', 0,
        'outcome', 'Verified',
        'evidence', 'Self-review attempt'
      )
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'reviewer self-review was not denied';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.mola_storage_review_contribution(
      'supabase:review-owner',
      jsonb_build_object(
        'org_id', 'review-org',
        'entry_id', 'review-org:00000000-0000-0000-0000-000000000001',
        'review_count', 1,
        'outcome', 'Owner reconciled',
        'evidence', 'Owner replacement attempt'
      )
    );
  EXCEPTION WHEN others THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'owner replacement of independent verification was not denied';
  END IF;
END;
$$;

DO $$
DECLARE
  entry_count integer;
BEGIN
  SELECT count(*) INTO entry_count
  FROM mola_private.entries
  WHERE org_id = 'review-org';
  IF entry_count <> 3 THEN
    RAISE EXCEPTION 'expected obligation plus two contributions, found %', entry_count;
  END IF;
END;
$$;

SELECT 'review write assertions passed; fictional rows rolled back' AS result;
ROLLBACK;

SELECT
  (SELECT count(*) FROM mola_private.organizations WHERE id = 'review-org') AS organizations,
  (SELECT count(*) FROM mola_private.entries WHERE org_id = 'review-org') AS entries;
