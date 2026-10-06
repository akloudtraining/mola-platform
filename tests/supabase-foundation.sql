BEGIN;
DO $test$
DECLARE accepted boolean; tbl text; original_text text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['organizations','entries','installation','notification_reads','auth_identity_links']) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mola_private' AND c.relname=tbl AND c.relrowsecurity) THEN RAISE EXCEPTION 'RLS missing on %',tbl; END IF;
    IF has_table_privilege('anon','mola_private.'||tbl,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','mola_private.'||tbl,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Browser grant found on %',tbl; END IF;
    IF NOT has_table_privilege('service_role','mola_private.'||tbl,'SELECT,INSERT,UPDATE') OR has_table_privilege('service_role','mola_private.'||tbl,'DELETE') THEN RAISE EXCEPTION 'Server grants incorrect on %',tbl; END IF;
  END LOOP;
  IF has_schema_privilege('anon','mola_private','USAGE') OR has_schema_privilege('authenticated','mola_private','USAGE') THEN RAISE EXCEPTION 'Private schema exposed'; END IF;
  INSERT INTO mola_private.organizations(id,owner,data,version) VALUES('__mola_regression_org__','fictional-owner','{"id":"__mola_regression_org__","members":[{"id":"member"}]}',1);
  original_text := '{"id":"__mola_regression_payment__","orgId":"__mola_regression_org__","created":"2026-10-01T16:00:00.000Z","submittedBy":"fictional-member","submissionObligationId":"fictional-due","submissionDeadline":{"at":"2026-10-01T16:00:00.000Z","localDateTime":"2026-10-01T12:00","timeZone":"America/Detroit"},"status":"Awaiting verification","title":"Fictional O''Brien"}';
  INSERT INTO mola_private.entries(id,org_id,data,created,recorded_at) VALUES('__mola_regression_payment__','__mola_regression_org__',original_text,'2026-10-01T16:00:00.000Z','2026-10-01T16:00:00.000Z');
  IF (SELECT data FROM mola_private.entries WHERE id='__mola_regression_payment__') IS DISTINCT FROM original_text THEN RAISE EXCEPTION 'Original JSON changed'; END IF;
  UPDATE mola_private.entries SET data=jsonb_set(data::jsonb,'{status}','"Verified"')::text WHERE id='__mola_regression_payment__';
  accepted:=false; BEGIN
    UPDATE mola_private.entries SET data=jsonb_set(data::jsonb,'{created}','"2020-01-01T00:00:00.000Z"')::text,created='2020-01-01T00:00:00.000Z',recorded_at='2020-01-01T00:00:00.000Z' WHERE id='__mola_regression_payment__'; accepted:=true;
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF accepted THEN RAISE EXCEPTION 'Mutable timestamp accepted'; END IF;
  accepted:=false; BEGIN
    UPDATE mola_private.entries SET data=jsonb_set(data::jsonb,'{submissionDeadline,at}','"2099-01-01T00:00:00.000Z"')::text WHERE id='__mola_regression_payment__'; accepted:=true;
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF accepted THEN RAISE EXCEPTION 'Mutable submission cutoff accepted'; END IF;
  accepted:=false; BEGIN
    UPDATE mola_private.entries SET data=jsonb_set(data::jsonb,'{submittedBy}','"another-user"')::text WHERE id='__mola_regression_payment__'; accepted:=true;
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF accepted THEN RAISE EXCEPTION 'Mutable submitter accepted'; END IF;
  accepted:=false; BEGIN
    UPDATE mola_private.organizations SET version=0 WHERE id='__mola_regression_org__'; accepted:=true;
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF accepted THEN RAISE EXCEPTION 'Invalid version accepted'; END IF;
  accepted:=false; BEGIN
    INSERT INTO mola_private.entries(id,org_id,data,created,recorded_at) VALUES('bad-entry','missing-org','{"id":"bad-entry","orgId":"missing-org","created":"2026-10-01T16:00:00.000Z"}','2026-10-01T16:00:00.000Z','2026-10-01T16:00:00.000Z'); accepted:=true;
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF accepted THEN RAISE EXCEPTION 'Unknown organization accepted'; END IF;
  INSERT INTO mola_private.notification_reads(id,user_id,org_id,event_id,read_at) VALUES('fictional-read','fictional-member','__mola_regression_org__','fictional-event','2026-10-01T16:00:00.000Z');
  accepted:=false; BEGIN
    INSERT INTO mola_private.notification_reads(id,user_id,org_id,event_id,read_at) VALUES('fictional-read-retry','fictional-member','__mola_regression_org__','fictional-event','2026-10-01T16:00:00.000Z'); accepted:=true;
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF accepted THEN RAISE EXCEPTION 'Duplicate read state accepted'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'foundation assertions passed; fictional rows rolled back' AS result,
 (SELECT count(*) FROM mola_private.organizations) AS organizations,
 (SELECT count(*) FROM mola_private.entries) AS entries,
 (SELECT count(*) FROM mola_private.notification_reads) AS notification_reads,
 (SELECT count(*) FROM auth.users) AS auth_users;
