-- Migration foundation only. Email auth and application SQL adapter follow separately.
-- Preserve original JSON text so optimistic-lock comparisons and audit snapshots survive.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mola_private;
REVOKE ALL ON SCHEMA mola_private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mola_private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mola_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE TABLE mola_private.organizations (
 id text PRIMARY KEY,
 owner text NOT NULL,
 data text NOT NULL CHECK (jsonb_typeof(data::jsonb) = 'object'),
 version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
 CHECK ((data::jsonb ->> 'id') IS NOT NULL AND data::jsonb ->> 'id' = id)
);
CREATE INDEX organizations_owner ON mola_private.organizations(owner);
CREATE TABLE mola_private.entries (
 id text PRIMARY KEY,
 org_id text NOT NULL REFERENCES mola_private.organizations(id),
 data text NOT NULL CHECK (jsonb_typeof(data::jsonb) = 'object'),
 created text NOT NULL,
 recorded_at timestamptz NOT NULL,
 CHECK ((data::jsonb ->> 'id') IS NOT NULL AND data::jsonb ->> 'id' = id),
 CHECK ((data::jsonb ->> 'orgId') IS NOT NULL AND data::jsonb ->> 'orgId' = org_id),
 CHECK ((data::jsonb ->> 'created') IS NOT NULL AND data::jsonb ->> 'created' = created),
 CHECK (recorded_at = created::timestamptz)
);
CREATE INDEX entries_org_created ON mola_private.entries(org_id, recorded_at DESC);
CREATE TABLE mola_private.installation (id text PRIMARY KEY, owner text NOT NULL);
CREATE TABLE mola_private.notification_reads (
 id text PRIMARY KEY,
 user_id text NOT NULL,
 org_id text NOT NULL REFERENCES mola_private.organizations(id),
 event_id text NOT NULL,
 read_at text NOT NULL,
 UNIQUE (user_id, org_id, event_id)
);
CREATE INDEX notification_reads_user_org ON mola_private.notification_reads(user_id, org_id);
CREATE INDEX notification_reads_org ON mola_private.notification_reads(org_id);

-- Auth UUIDs are linked explicitly; importing records never grants membership.
-- The principal stays stable so historical approvals keep their original identity.
CREATE TABLE mola_private.auth_identity_links (
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 principal_id text NOT NULL UNIQUE,
 verified_email text NOT NULL CHECK (verified_email = lower(btrim(verified_email))),
 linked_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 linked_by text NOT NULL
);

CREATE FUNCTION mola_private.protect_record_provenance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE old_data jsonb := OLD.data::jsonb; new_data jsonb := NEW.data::jsonb;
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.created IS DISTINCT FROM OLD.created OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
    OR new_data -> 'created' IS DISTINCT FROM old_data -> 'created'
    OR new_data -> 'submittedBy' IS DISTINCT FROM old_data -> 'submittedBy'
    OR new_data -> 'submissionDeadline' IS DISTINCT FROM old_data -> 'submissionDeadline'
    OR new_data -> 'submissionObligationId' IS DISTINCT FROM old_data -> 'submissionObligationId' THEN
  RAISE EXCEPTION 'Original recording provenance is immutable';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mola_private.protect_record_provenance() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_record_provenance BEFORE UPDATE ON mola_private.entries
FOR EACH ROW EXECUTE FUNCTION mola_private.protect_record_provenance();

ALTER TABLE mola_private.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mola_private.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mola_private.installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE mola_private.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mola_private.auth_identity_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA mola_private FROM PUBLIC, anon, authenticated;
-- No browser policies or grants: all reads/writes require the verified server path.
GRANT USAGE ON SCHEMA mola_private TO service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA mola_private TO service_role;
COMMIT;
