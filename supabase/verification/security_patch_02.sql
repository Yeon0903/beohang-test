-- READ ONLY: manually run only against the approved project. Do not paste account rows or secrets.
SELECT current_database(),current_user;
SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('virhang_users','virhang_account_libraries','virhang_published_tracks','virhang_artist_identities');
SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('virhang_users','virhang_account_libraries','virhang_published_tracks','virhang_artist_identities') ORDER BY tablename,policyname;
SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema IN ('public','virhang_private') AND grantee IN ('anon','authenticated','PUBLIC') ORDER BY table_name,grantee,privilege_type;
SELECT grantee,table_name,column_name,privilege_type FROM information_schema.column_privileges
 WHERE table_schema='public' AND table_name IN ('virhang_users','virhang_artist_identities')
 AND grantee IN ('anon','authenticated','PUBLIC') ORDER BY table_name,column_name;
SELECT p.oid::regprocedure AS function_name,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'virhang_%' ORDER BY p.proname;
-- Only project owner/service_role should execute the next policy read.
SELECT public.virhang_login_policy();
