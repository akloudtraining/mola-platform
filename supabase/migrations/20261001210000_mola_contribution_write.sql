-- Route-specific, server-constructed contribution submission.
-- The caller supplies contribution fields only; provenance and review state are
-- constructed here.  Browser roles never receive this function directly.
BEGIN;

CREATE OR REPLACE FUNCTION public.mola_storage_submit_contribution(
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
  new_entry_id text;
  contribution_title text;
  target_member_id text;
  amount_text text;
  amount_minor bigint;
  contribution_currency text;
  contribution_method text;
  contribution_date text;
  contribution_reference text;
  contribution_purpose text;
  submission_obligation_id text;
  org_owner text;
  org_data text;
  org_json jsonb;
  members_json jsonb;
  actor_member jsonb;
  target_member jsonb;
  submitted_name text;
  due_json jsonb;
  submission_deadline jsonb;
  created_text text;
  new_data jsonb;
  existing_data jsonb;
  existing_org_id text;
  changes_count integer;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'Storage actor is required';
  END IF;
  IF jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'Contribution payload must be an object';
  END IF;
  IF COALESCE(jsonb_typeof(payload -> 'org_id'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'entry_id'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'title'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'member_id'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'amount_minor'), '') NOT IN ('number', 'string')
     OR COALESCE(jsonb_typeof(payload -> 'currency'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'method'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'date'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'reference'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'purpose'), '') <> 'string'
     OR COALESCE(jsonb_typeof(payload -> 'submission_obligation_id'), 'null') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Contribution payload is incomplete';
  END IF;

  target_org_id := NULLIF(btrim(payload ->> 'org_id'), '');
  new_entry_id := NULLIF(btrim(payload ->> 'entry_id'), '');
  contribution_title := btrim(payload ->> 'title');
  target_member_id := NULLIF(btrim(payload ->> 'member_id'), '');
  amount_text := btrim(payload ->> 'amount_minor');
  contribution_currency := btrim(payload ->> 'currency');
  contribution_method := btrim(payload ->> 'method');
  contribution_date := btrim(payload ->> 'date');
  contribution_reference := btrim(payload ->> 'reference');
  contribution_purpose := btrim(payload ->> 'purpose');
  submission_obligation_id := NULLIF(btrim(payload ->> 'submission_obligation_id'), '');

  IF target_org_id IS NULL OR length(target_org_id) > 200
     OR new_entry_id IS NULL OR length(new_entry_id) > 300
     OR position(target_org_id || ':' in new_entry_id) <> 1
     OR contribution_title = '' OR length(contribution_title) > 180
     OR target_member_id IS NULL OR length(target_member_id) > 200
     OR contribution_reference IS NULL OR length(contribution_reference) > 5000
     OR contribution_purpose IS NULL OR length(contribution_purpose) > 5000
     OR submission_obligation_id IS NOT NULL AND length(submission_obligation_id) > 300 THEN
    RAISE EXCEPTION 'Check the contribution identifiers and text fields';
  END IF;

  IF amount_text IS NULL OR amount_text !~ '^[1-9][0-9]{0,11}$' THEN
    RAISE EXCEPTION 'Contribution amount must be a positive integer in minor units';
  END IF;
  amount_minor := amount_text::bigint;
  IF amount_minor > 100000000000 THEN
    RAISE EXCEPTION 'Contribution amount is outside the supported range';
  END IF;
  IF contribution_currency NOT IN ('USD', 'CAD', 'XAF')
     OR contribution_method NOT IN ('Zelle (external)', 'Bank transfer (external)', 'Other external payment') THEN
    RAISE EXCEPTION 'Unsupported contribution currency or method';
  END IF;
  IF contribution_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Contribution date must use YYYY-MM-DD';
  END IF;
  BEGIN
    IF contribution_date::date::text IS DISTINCT FROM contribution_date THEN
      RAISE EXCEPTION 'Contribution date is invalid';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Contribution date is invalid';
  END;

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
    INTO target_member
  FROM jsonb_array_elements(members_json) AS member(value)
  WHERE member.value ->> 'id' = target_member_id;
  IF target_member IS NULL THEN
    RAISE EXCEPTION 'Member is unavailable';
  END IF;

  SELECT member.value
    INTO actor_member
  FROM jsonb_array_elements(members_json) AS member(value)
  WHERE member.value @> jsonb_build_object(
    'access', jsonb_build_object('enabled', true, 'userId', p_actor)
  );
  IF org_owner <> p_actor AND actor_member IS NULL THEN
    RAISE EXCEPTION 'Organization is unavailable';
  END IF;
  IF org_owner <> p_actor AND actor_member ->> 'id' IS DISTINCT FROM target_member_id THEN
    RAISE EXCEPTION 'You can submit only your own contributions';
  END IF;
  submitted_name := CASE
    WHEN org_owner = p_actor THEN 'Workspace owner'
    ELSE COALESCE(NULLIF(btrim(actor_member ->> 'name'), ''), 'Member')
  END;

  -- A retry returns the original row without recomputing a possibly changed
  -- obligation deadline.  Mutable review fields are intentionally ignored.
  SELECT e.org_id, e.data::jsonb
    INTO existing_org_id, existing_data
  FROM mola_private.entries e
  WHERE e.id = new_entry_id;
  IF FOUND THEN
    IF existing_org_id IS DISTINCT FROM target_org_id
       OR existing_data ->> 'type' IS DISTINCT FROM 'contribution'
       OR existing_data ->> 'submittedBy' IS DISTINCT FROM p_actor
       OR existing_data ->> 'title' IS DISTINCT FROM contribution_title
       OR existing_data ->> 'memberId' IS DISTINCT FROM target_member_id
       OR existing_data ->> 'amountMinor' IS DISTINCT FROM amount_minor::text
       OR existing_data ->> 'currency' IS DISTINCT FROM contribution_currency
       OR existing_data ->> 'method' IS DISTINCT FROM contribution_method
       OR existing_data ->> 'date' IS DISTINCT FROM contribution_date
       OR existing_data ->> 'reference' IS DISTINCT FROM contribution_reference
       OR existing_data ->> 'purpose' IS DISTINCT FROM contribution_purpose
       OR existing_data ->> 'submissionObligationId' IS DISTINCT FROM submission_obligation_id THEN
      RAISE EXCEPTION 'Entry id already exists with different contribution data';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'submit_contribution',
      'changes', 0,
      'entry', existing_data
    );
  END IF;

  IF submission_obligation_id IS NOT NULL THEN
    SELECT e.data::jsonb
      INTO due_json
    FROM mola_private.entries e
    WHERE e.id = submission_obligation_id
      AND e.org_id = target_org_id
    FOR SHARE;
    IF NOT FOUND OR due_json ->> 'type' IS DISTINCT FROM 'obligation'
       OR due_json ->> 'memberId' IS DISTINCT FROM target_member_id
       OR due_json ->> 'currency' IS DISTINCT FROM contribution_currency THEN
      RAISE EXCEPTION 'The deadline must belong to this member and currency';
    END IF;
    submission_deadline := due_json -> 'deadline';
  END IF;

  created_text := to_char(
    statement_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  new_data := jsonb_strip_nulls(jsonb_build_object(
    'id', new_entry_id,
    'orgId', target_org_id,
    'type', 'contribution',
    'title', contribution_title,
    'memberId', target_member_id,
    'amountMinor', amount_minor,
    'currency', contribution_currency,
    'method', contribution_method,
    'date', contribution_date,
    'reference', contribution_reference,
    'purpose', contribution_purpose,
    'status', 'Awaiting verification',
    'created', created_text,
    'submittedBy', p_actor,
    'submittedName', submitted_name,
    'submissionObligationId', submission_obligation_id,
    'submissionDeadline', submission_deadline
  ));

  INSERT INTO mola_private.entries(id, org_id, data, created, recorded_at)
  VALUES (new_entry_id, target_org_id, new_data::text, created_text, created_text::timestamptz)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS changes_count = ROW_COUNT;
  IF changes_count = 1 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'action', 'submit_contribution',
      'changes', 1,
      'entry', new_data
    );
  END IF;

  -- A concurrent insert won the idempotency race.  Apply the same collision
  -- checks before returning its immutable record.
  SELECT e.org_id, e.data::jsonb
    INTO existing_org_id, existing_data
  FROM mola_private.entries e
  WHERE e.id = new_entry_id;
  IF NOT FOUND
     OR existing_org_id IS DISTINCT FROM target_org_id
     OR existing_data ->> 'type' IS DISTINCT FROM 'contribution'
     OR existing_data ->> 'submittedBy' IS DISTINCT FROM p_actor
     OR existing_data ->> 'title' IS DISTINCT FROM contribution_title
     OR existing_data ->> 'memberId' IS DISTINCT FROM target_member_id
     OR existing_data ->> 'amountMinor' IS DISTINCT FROM amount_minor::text
     OR existing_data ->> 'currency' IS DISTINCT FROM contribution_currency
     OR existing_data ->> 'method' IS DISTINCT FROM contribution_method
     OR existing_data ->> 'date' IS DISTINCT FROM contribution_date
     OR existing_data ->> 'reference' IS DISTINCT FROM contribution_reference
     OR existing_data ->> 'purpose' IS DISTINCT FROM contribution_purpose
     OR existing_data ->> 'submissionObligationId' IS DISTINCT FROM submission_obligation_id THEN
    RAISE EXCEPTION 'Entry id already exists with different contribution data';
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'action', 'submit_contribution',
    'changes', 0,
    'entry', existing_data
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mola_storage_submit_contribution(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mola_storage_submit_contribution(text, jsonb) TO service_role;

COMMIT;
