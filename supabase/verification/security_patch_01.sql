-- READ ONLY. Run manually on the approved staging project after schema review.
-- These catalog checks do NOT replace direct RPC/RLS tests with test accounts.
SELECT current_database() AS review_database, current_user AS review_actor;
SELECT p.oid::regprocedure AS function_name, p.prosecdef AS security_definer,
       p.proconfig, pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('virhang_admin_streamer_account','virhang_admin_link_artist','virhang_sync_song_singers')
ORDER BY p.proname;

SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('virhang_users','virhang_published_tracks','virhang_artist_identities','virhang_song_singers');
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('virhang_users','virhang_published_tracks','virhang_artist_identities','virhang_song_singers')
ORDER BY tablename,policyname;
