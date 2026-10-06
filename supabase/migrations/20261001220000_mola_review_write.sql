-- Route-specific, server-constructed contribution review.
-- This records receipt evidence and optional obligation credit; it never moves
-- money or changes ownership units.
BEGIN;

CREATE OR REPLACE FUNCTION public.mola_storage_review_contribution(
  p_actor text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public, mola_private
AS $$
DECLARE
  payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  target_org_id text;
  target_entry_id text;
  review_count_text text;
  expected_review_count integer;
  outcome text;
  evidence text;
  obligation_id text;
  credit_text text;
  credit_minor bigint := 0;
  org_owner text;
  org_data text;
  org_json jsonb;
  members_json jsonb;
  actor_member jsonb;
  actor_member_id text;
  actor_name text;
  payment_data jsonb;
  previous_text text;
  payment_reviews jsonb;
  due_data jsonb;
  review_data jsonb;
  next_data jsonb;
  review_at_text text;
  changes_count integer;
  independent boolean := false;
  has_verified boolean := false;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'Storage actor is required';
  END IF;
  IF jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'Review payload must be an object';
  END IF;
  IF COALESCE(jsonb_typeof(payload -> 'org_id'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'entry_id'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'review_count'), '') NOT IN ('number', 'string')
     OR COALESCE(jsonb_typeof(payload -> 'outcome'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'evidence'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'obligation_id'), 'null') NOT IN ('string', 'null')
     OR COALESCE(jsonb_typeof(payload -> 'credit_minor'), 'null') NOT IN ('number', 'string', 'null') THEN
    RAISE EXCEPTION 'Review payload is incomplete';
  END IF;

  target_org_id := NULLIF(btrim(payload ->> 'org_id'), '');
  target_entry_id := NULLIF(btrim(payload ->> 'entry_id'), '');
  review_count_text := btrim(payload ->> 'review_count');
  outcome := btrim(payload ->> 'outcome');
  evidence := btrim(payload ->> 'evidence');
  obligation_id := NULLIF(btrim(payload ->> 'obligation_id'), '');
  credit_text := NULLIF(btrim(payload ->> 'credit_minor'), '');

  IF target_org_id IS NULL OR length(target_org_id) > 200
     OR target_entry_id IS NULL OR length(target_entry_id) > 300
     OR position(target_org_id || ':' in target_entry_id) <> 1
     OR review_count_text IS NULL OR review_count_text !~ '^[0-9]{1,6}$'
     OR outcome NOT IN ('Owner reconciled', 'Verified', 'Rejected', 'Awaiting verification')
     OR length(evidence) < 5 OR length(evidence) > 2000
     OR obligation_id IS NOT NULL AND length(obligation_id) > 300 THEN
    RAISE EXCEPTION 'Check the review outcome, evidence, and identifiers';
  END IF;
  expected_review_count := review_count_text::integer;

  IF credit_text IS NOT NULL AND credit_text !~ '^[1-9][0-9]{0,11}$' THEN
    RAISE EXCEPTION 'Review credit must be a positive integer in minor units';
  END IF;
  IF credit_text IS NOT NULL THEN
    credit_minor := credit_text::bigint;
    IF credit_minor > 100000000000 THEN
      RAISE EXCEPTION 'Review credit is outside the supported range';
    END IF;
  END IF;

  SELECT o.owner, o.data
    INTO org_owner, org_data
  FROM mola_private.organizations o
  WHERE o.id = target_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization is unavailable';
  END IF;
  org_json := org_data::jsonb;
  members_json := CASE
    WHEN jsonb_typeof(org_json -> 'members') = 'array' THEN org_json -> 'members'
    ELSE '[]'::jsonb
  END;
  SELECT member.value
    INTO actor_member
  FROM jsonb_array_elements(members_json) AS member(value)
  WHERE member.value @> jsonb_build_object(
    'access', jsonb_build_object('enabled', true, 'userId', p_actor)
  );
  IF org_owner <> p_actor AND actor_member IS NULL THEN
    RAISE EXCEPTION 'Organization is unavailable';
  END IF;
  actor_member_id := actor_member ->> 'id';
  actor_name := CASE
    WHEN org_owner = p_actor THEN 'Workspace owner'
    ELSE COALESCE(NULLIF(btrim(actor_member ->> 'name'), ''), 'Member')
  END;

  SELECT e.data, e.data::jsonb
    INTO previous_text, payment_data
  FROM mola_private.entries e
  WHERE e.id = target_entry_id
    AND e.org_id = target_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment is unavailable';
  END IF;
  IF payment_data ->> 'type' IS DISTINCT FROM 'contribution' THEN
    RAISE EXCEPTION 'Only contributions can be reviewed';
  END IF;
  IF payment_data ->> 'submittedBy' IS NOT DISTINCT FROM p_actor
     OR actor_member_id IS NOT NULL AND payment_data ->> 'memberId' IS NOT DISTINCT FROM actor_member_id THEN
    RAISE EXCEPTION 'Contributors and submitters cannot review their own payment';
  END IF;

  payment_reviews := CASE
    WHEN jsonb_typeof(payment_data -> 'reviews') = 'array' THEN payment_data -> 'reviews'
    ELSE '[]'::jsonb
  END;
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(payment_reviews) AS review(value)
    WHERE review.value ->> 'outcome' = 'Verified'
  ) INTO has_verified;
  independent := org_owner <> p_actor
    AND actor_member IS NOT NULL
    AND actor_member -> 'access' @> jsonb_build_object('canReview', true)
    AND actor_member_id IS DISTINCT FROM payment_data ->> 'memberId';

  IF outcome = 'Verified' AND NOT independent THEN
    RAISE EXCEPTION 'Verification requires a different authorized member';
  END IF;
  IF outcome = 'Owner reconciled' AND (org_owner <> p_actor OR has_verified) THEN
    RAISE EXCEPTION 'Owner reconciliation cannot replace an independent verification';
  END IF;
  IF outcome NOT IN ('Verified', 'Owner reconciled')
     AND NOT independent
     AND (org_owner <> p_actor OR has_verified) THEN
    RAISE EXCEPTION 'A different authorized reviewer must make this correction';
  END IF;
  IF jsonb_array_length(payment_reviews) <> expected_review_count THEN
    RAISE EXCEPTION 'This payment changed; refresh before reviewing';
  END IF;

  IF outcome IN ('Verified', 'Owner reconciled') AND obligation_id IS NOT NULL THEN
    IF credit_text IS NULL THEN
      RAISE EXCEPTION 'Provide a positive credit amount for the selected obligation';
    END IF;
    SELECT e.data::jsonb
      INTO due_data
    FROM mola_private.entries e
    WHERE e.id = obligation_id
      AND e.org_id = target_org_id
    FOR SHARE;
    IF NOT FOUND OR due_data ->> 'type' IS DISTINCT FROM 'obligation'
       OR due_data ->> 'memberId' IS DISTINCT FROM payment_data ->> 'memberId'
       OR due_data ->> 'currency' IS DISTINCT FROM payment_data ->> 'currency' THEN
      RAISE EXCEPTION 'Credit requires the same member and currency';
    END IF;
    IF credit_minor > (payment_data ->> 'amountMinor')::bigint THEN
      RAISE EXCEPTION 'Credit cannot exceed this payment';
    END IF;
  ELSE
    credit_minor := 0;
  END IF;

  review_at_text := to_char(
    statement_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  review_data := jsonb_build_object(
    'outcome', outcome,
    'evidence', evidence,
    'actor', p_actor,
    'actorName', actor_name,
    'at', review_at_text,
    'obligationId', CASE WHEN outcome IN ('Verified', 'Owner reconciled') THEN COALESCE(obligation_id, '') ELSE '' END,
    'creditMinor', credit_minor
  );
  next_data := payment_data || jsonb_build_object(
    'status', outcome,
    'reviews', payment_reviews || jsonb_build_array(review_data)
  );

  UPDATE mola_private.entries e
  SET data = next_data::text
  WHERE e.id = target_entry_id
    AND e.org_id = target_org_id
    AND e.data = previous_text;
  GET DIAGNOSTICS changes_count = ROW_COUNT;
  IF changes_count <> 1 THEN
    RAISE EXCEPTION 'This payment changed; refresh before reviewing';
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'action', 'review_contribution',
    'changes', 1,
    'entry', next_data
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mola_storage_review_contribution(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mola_storage_review_contribution(text, jsonb) TO service_role;

COMMIT;
