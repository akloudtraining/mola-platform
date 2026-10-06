-- Server-only storage boundary for the private Mola ledger.
-- Browser roles never receive schema, table, or function access.
BEGIN;

CREATE SCHEMA IF NOT EXISTS mola_api;
REVOKE ALL ON SCHEMA mola_api FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA mola_api TO service_role;

CREATE OR REPLACE FUNCTION public.mola_storage_read(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, mola_private
AS $$
DECLARE result jsonb;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'Storage actor is required';
  END IF;

  WITH visible AS MATERIALIZED (
    SELECT o.id, o.owner, o.data, o.version
    FROM mola_private.organizations o
    WHERE o.owner = p_actor
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(o.data::jsonb -> 'members', '[]'::jsonb)) member
         WHERE member.value @> jsonb_build_object(
           'access', jsonb_build_object('enabled', true, 'userId', p_actor)
         )
       )
  )
  SELECT jsonb_build_object(
    'installation', COALESCE(
      (SELECT row_to_json(i)::jsonb FROM mola_private.installation i WHERE i.id = 'primary' AND i.owner = p_actor),
      'null'::jsonb
    ),
    'organizations', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', v.id, 'owner', v.owner, 'data', v.data, 'version', v.version) ORDER BY v.id) FROM visible v),
      '[]'::jsonb
    ),
    'entries', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', e.id, 'org_id', e.org_id, 'data', e.data, 'created', e.created, 'recorded_at', e.recorded_at) ORDER BY e.recorded_at DESC)
       FROM mola_private.entries e JOIN visible v ON v.id = e.org_id),
      '[]'::jsonb
    ),
    'notification_reads', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', r.id, 'user_id', r.user_id, 'org_id', r.org_id, 'event_id', r.event_id, 'read_at', r.read_at) ORDER BY r.read_at DESC)
       FROM mola_private.notification_reads r JOIN visible v ON v.id = r.org_id WHERE r.user_id = p_actor),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.mola_storage_mutate(p_actor text, p_action text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, mola_private
AS $$
DECLARE
  payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  target_org_id text;
  entry_id text;
  data_text text;
  expected_text text;
  created_text text;
  read_at_text text;
  expected_version bigint;
  changes_count integer := 0;
  inserted_count integer := 0;
  member_access boolean;
  org_owner text;
  org_data text;
  item jsonb;
  event_key text;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RAISE EXCEPTION 'Storage actor is required';
  END IF;

  IF p_action = 'bootstrap' THEN
    IF COALESCE(payload ->> 'owner', p_actor) <> p_actor THEN
      RAISE EXCEPTION 'Bootstrap owner must match the authenticated actor';
    END IF;
    IF EXISTS (SELECT 1 FROM mola_private.installation WHERE id = 'primary' AND owner <> p_actor) THEN
      RAISE EXCEPTION 'The ledger already has a different installation owner';
    END IF;
    INSERT INTO mola_private.installation(id, owner)
    VALUES ('primary', p_actor)
    ON CONFLICT (id) DO NOTHING;

    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'organizations', '[]'::jsonb)) LOOP
      target_org_id := NULLIF(btrim(item ->> 'id'), '');
      IF target_org_id IS NULL OR jsonb_typeof(item) <> 'object' THEN
        RAISE EXCEPTION 'Bootstrap organizations must contain object records with ids';
      END IF;
      INSERT INTO mola_private.organizations(id, owner, data, version)
      VALUES (target_org_id, p_actor, item::text, GREATEST(COALESCE((item ->> 'version')::bigint, 1), 1))
      ON CONFLICT (id) DO NOTHING;
      GET DIAGNOSTICS changes_count = ROW_COUNT;
      inserted_count := inserted_count + changes_count;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'action', p_action, 'inserted', inserted_count);
  END IF;

  IF p_action = 'organization_update' THEN
    target_org_id := NULLIF(btrim(payload ->> 'org_id'), '');
    data_text := payload ->> 'data';
    expected_version := (payload ->> 'expected_version')::bigint;
    IF target_org_id IS NULL OR data_text IS NULL OR expected_version IS NULL THEN
      RAISE EXCEPTION 'Organization update payload is incomplete';
    END IF;
    IF (data_text::jsonb ->> 'id') IS DISTINCT FROM target_org_id THEN
      RAISE EXCEPTION 'Organization data id does not match the record id';
    END IF;
    UPDATE mola_private.organizations
    SET data = data_text, version = expected_version + 1
    WHERE id = target_org_id AND owner = p_actor AND version = expected_version;
    GET DIAGNOSTICS changes_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'action', p_action, 'changes', changes_count, 'version', expected_version + 1);
  END IF;

  IF p_action IN ('entry_insert', 'entry_update', 'mark_read') THEN
    target_org_id := NULLIF(btrim(payload ->> 'org_id'), '');
    IF target_org_id IS NULL THEN
      RAISE EXCEPTION 'Organization id is required';
    END IF;
    SELECT o.owner, o.data INTO org_owner, org_data
    FROM mola_private.organizations o
    WHERE o.id = target_org_id;
    IF org_owner IS NULL THEN
      RAISE EXCEPTION 'Organization is unavailable';
    END IF;
    member_access := org_owner = p_actor OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(org_data::jsonb -> 'members', '[]'::jsonb)) member
      WHERE member.value @> jsonb_build_object(
        'access', jsonb_build_object('enabled', true, 'userId', p_actor)
      )
    );
    IF NOT member_access THEN
      RAISE EXCEPTION 'Organization is unavailable';
    END IF;
  END IF;

  IF p_action = 'entry_insert' THEN
    entry_id := NULLIF(btrim(payload ->> 'entry_id'), '');
    data_text := payload ->> 'data';
    created_text := payload ->> 'created';
    IF entry_id IS NULL OR data_text IS NULL OR created_text IS NULL THEN
      RAISE EXCEPTION 'Entry insert payload is incomplete';
    END IF;
    IF (data_text::jsonb ->> 'id') IS DISTINCT FROM entry_id
       OR (data_text::jsonb ->> 'orgId') IS DISTINCT FROM target_org_id
       OR (data_text::jsonb ->> 'created') IS DISTINCT FROM created_text THEN
      RAISE EXCEPTION 'Entry provenance does not match the record id, organization, or created time';
    END IF;
    INSERT INTO mola_private.entries(id, org_id, data, created, recorded_at)
    VALUES (entry_id, target_org_id, data_text, created_text, created_text::timestamptz)
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS changes_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'action', p_action, 'changes', changes_count);
  END IF;

  IF p_action = 'entry_update' THEN
    entry_id := NULLIF(btrim(payload ->> 'entry_id'), '');
    data_text := payload ->> 'data';
    expected_text := payload ->> 'expected_data';
    IF entry_id IS NULL OR data_text IS NULL OR expected_text IS NULL THEN
      RAISE EXCEPTION 'Entry update payload is incomplete';
    END IF;
    IF (data_text::jsonb ->> 'id') IS DISTINCT FROM entry_id
       OR (data_text::jsonb ->> 'orgId') IS DISTINCT FROM target_org_id THEN
      RAISE EXCEPTION 'Entry provenance does not match the record id or organization';
    END IF;
    UPDATE mola_private.entries e
    SET data = data_text
    WHERE e.id = entry_id AND e.org_id = target_org_id AND e.data = expected_text;
    GET DIAGNOSTICS changes_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'action', p_action, 'changes', changes_count);
  END IF;

  IF p_action = 'mark_read' THEN
    read_at_text := COALESCE(NULLIF(payload ->> 'read_at', ''), statement_timestamp()::text);
    FOR event_key IN SELECT value FROM jsonb_array_elements_text(COALESCE(payload -> 'event_ids', '[]'::jsonb)) LOOP
      INSERT INTO mola_private.notification_reads(id, user_id, org_id, event_id, read_at)
      VALUES (p_actor || ':' || target_org_id || ':' || event_key, p_actor, target_org_id, event_key, read_at_text)
      ON CONFLICT (user_id, org_id, event_id) DO NOTHING;
      GET DIAGNOSTICS changes_count = ROW_COUNT;
      inserted_count := inserted_count + changes_count;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'action', p_action, 'inserted', inserted_count);
  END IF;

  RAISE EXCEPTION 'Unsupported storage action';
END;
$$;

REVOKE ALL ON FUNCTION public.mola_storage_read(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mola_storage_mutate(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mola_storage_read(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mola_storage_mutate(text, text, jsonb) TO service_role;

COMMIT;
