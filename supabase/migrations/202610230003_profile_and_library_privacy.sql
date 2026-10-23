-- No account or library data writes. Requires reviewed virhang_users and V2.4 libraries.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regclass('public.virhang_users') IS NULL OR to_regclass('public.virhang_account_libraries') IS NULL THEN
  RAISE EXCEPTION 'Review existing profile/library schema before privacy patch';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.virhang_has_valid_profile()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.virhang_users WHERE id=auth.uid() AND role IN ('viewer','streamer','admin','super_admin'));
$$;
REVOKE ALL ON FUNCTION public.virhang_has_valid_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_has_valid_profile() TO authenticated;

-- Remove table AND any legacy column grants; role changes remain in reviewed admin RPCs.
REVOKE ALL ON public.virhang_users,public.virhang_account_libraries FROM PUBLIC,anon,authenticated;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT table_name,column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('virhang_users','virhang_account_libraries') LOOP
  EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',c.column_name,c.table_name);
 END LOOP;
END $$;
GRANT SELECT(id,username,display_name,role,updated_at) ON public.virhang_users TO authenticated;
ALTER TABLE public.virhang_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS virhang_profile_own_read ON public.virhang_users;
CREATE POLICY virhang_profile_own_read ON public.virhang_users FOR SELECT TO authenticated USING(id=auth.uid());
DROP POLICY IF EXISTS virhang_profile_read_guard ON public.virhang_users;
CREATE POLICY virhang_profile_read_guard ON public.virhang_users AS RESTRICTIVE FOR SELECT TO authenticated
 USING(id=auth.uid() AND role IN ('viewer','streamer','admin','super_admin'));
DROP POLICY IF EXISTS virhang_profile_no_direct_write ON public.virhang_users;
CREATE POLICY virhang_profile_no_direct_write ON public.virhang_users AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(id=auth.uid()) WITH CHECK(false);
-- No direct INSERT/UPDATE/DELETE grant; signup and admin SECURITY DEFINER functions retain their owner's privileges.

ALTER TABLE public.virhang_account_libraries ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.virhang_account_libraries TO authenticated;
DROP POLICY IF EXISTS virhang_library_own_guard ON public.virhang_account_libraries;
CREATE POLICY virhang_library_own_guard ON public.virhang_account_libraries AS RESTRICTIVE FOR ALL TO authenticated
 USING(user_id=auth.uid() AND public.virhang_has_valid_profile())
 WITH CHECK(user_id=auth.uid() AND public.virhang_has_valid_profile());
-- Existing V2.4 permissive own policies stay intact. Admins have no access to others' private playlists.

-- Artist credits are public; internal verified UUIDs are not public profile data.
REVOKE ALL ON public.virhang_artist_identities FROM PUBLIC,anon,authenticated;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='virhang_artist_identities' LOOP
  EXECUTE format('REVOKE ALL (%I) ON public.virhang_artist_identities FROM PUBLIC,anon,authenticated',c.column_name);
 END LOOP;
END $$;
GRANT SELECT(artist_key,display_name) ON public.virhang_artist_identities TO anon,authenticated;
COMMIT;
