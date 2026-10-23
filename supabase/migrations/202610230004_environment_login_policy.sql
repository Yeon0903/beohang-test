-- Default is production strict. Staging relaxation is a separate, explicitly approved operation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA IF NOT EXISTS virhang_private;
REVOKE ALL ON SCHEMA virhang_private FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS virhang_private.login_security (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 environment text NOT NULL DEFAULT 'production' CHECK(environment IN ('staging','production')),
 developer_bypass boolean NOT NULL DEFAULT false,
 limiter_fingerprint text,
 CHECK(environment='staging' OR NOT developer_bypass)
);
INSERT INTO virhang_private.login_security(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS virhang_private.login_attempts (
 username text PRIMARY KEY CHECK(username ~ '^[a-z0-9]{4,20}$'),
 attempt_count integer NOT NULL CHECK(attempt_count>0),
 window_started timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA virhang_private FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.virhang_check_login_limit(p_username text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg virhang_private.login_security%ROWTYPE; target_role text; attempts integer;
BEGIN
 IF p_username IS NULL OR p_username !~ '^[a-z0-9]{4,20}$' THEN RETURN false; END IF;
 SELECT * INTO cfg FROM virhang_private.login_security WHERE singleton;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT role INTO target_role FROM public.virhang_users WHERE username=p_username;
 -- Only known, ordinary test profiles may bypass. Admin/super_admin/unknown users always limited.
 IF cfg.environment='staging' AND cfg.developer_bypass AND target_role IN ('viewer','streamer') THEN RETURN true; END IF;
 INSERT INTO virhang_private.login_attempts AS t(username,attempt_count,window_started) VALUES(p_username,1,now())
 ON CONFLICT(username) DO UPDATE SET
 attempt_count=CASE WHEN t.window_started < now()-interval '15 minutes' THEN 1 ELSE least(t.attempt_count+1,1000000) END,
 window_started=CASE WHEN t.window_started < now()-interval '15 minutes' THEN now() ELSE t.window_started END
 RETURNING attempt_count INTO attempts;
 RETURN attempts<=5;
END $$;
REVOKE ALL ON FUNCTION public.virhang_check_login_limit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_check_login_limit(text) TO service_role;
-- A later accidental replacement by legacy SELECT true is detected by the Edge handler.
UPDATE virhang_private.login_security SET limiter_fingerprint=md5(pg_get_functiondef('public.virhang_check_login_limit(text)'::regprocedure));
CREATE OR REPLACE FUNCTION public.virhang_login_policy()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('environment',environment,'developer_bypass',developer_bypass,
 'privileged_accounts_limited',true,
 'limiter_integrity',limiter_fingerprint=md5(pg_get_functiondef('public.virhang_check_login_limit(text)'::regprocedure)))
 FROM virhang_private.login_security WHERE singleton;
$$;
REVOKE ALL ON FUNCTION public.virhang_login_policy() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_login_policy() TO service_role;
COMMIT;
