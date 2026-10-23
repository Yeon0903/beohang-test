-- Read-only catalog inventory. Run in the confirmed project's SQL Editor only.
-- Returns structure/permissions, never account rows, passwords, tokens, keys or function bodies.
-- This file applies no migration and grants no privilege.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT current_database() AS database_name,current_user AS inspection_actor,version() AS server_version;
SELECT n.nspname AS schema_name,c.relname AS table_name,c.relrowsecurity AS rls_enabled,
 c.relforcerowsecurity AS force_rls,pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','virhang_private') AND c.relkind IN ('r','p','v','m')
 AND (c.relname LIKE 'virhang_%' OR n.nspname='virhang_private') ORDER BY 1,2;
SELECT table_schema,table_name,column_name,data_type,udt_name,is_nullable
FROM information_schema.columns
WHERE (table_schema='public' AND table_name IN
 ('virhang_users','virhang_login_attempts','virhang_account_libraries','virhang_published_tracks','virhang_artist_identities','virhang_song_singers','virhang_rank_listens'))
 OR table_schema='virhang_private' ORDER BY table_schema,table_name,ordinal_position;
-- Constraint definitions should be inspected privately in Dashboard before approval.
SELECT n.nspname AS schema_name,c.relname AS table_name,k.conname,k.contype,k.convalidated,
 CASE WHEN k.confrelid<>0 THEN k.confrelid::regclass::text END AS referenced_table
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','virhang_private') AND (c.relname LIKE 'virhang_%' OR n.nspname='virhang_private') ORDER BY 1,2,3;
SELECT schemaname,tablename,policyname,permissive,roles,cmd
FROM pg_policies WHERE schemaname IN ('public','virhang_private')
 AND (tablename LIKE 'virhang_%' OR schemaname='virhang_private') ORDER BY 1,2,3;
SELECT grantee,table_schema,table_name,privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public','virhang_private') AND grantee IN ('PUBLIC','anon','authenticated','service_role') ORDER BY 2,3,1,4;
SELECT grantee,table_schema,table_name,column_name,privilege_type
FROM information_schema.column_privileges
WHERE table_schema IN ('public','virhang_private') AND grantee IN ('PUBLIC','anon','authenticated') ORDER BY 2,3,4,1;
SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef AS security_definer,
 COALESCE('search_path=""'=ANY(p.proconfig),false) AS empty_search_path,
 EXISTS(SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg NOT LIKE 'search_path=%') AS other_settings_present,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'virhang_%' ORDER BY 1;
SELECT event_object_schema,event_object_table,trigger_name,event_manipulation,action_timing
FROM information_schema.triggers
WHERE event_object_schema='auth' AND event_object_table='users'
 OR event_object_schema='public' AND event_object_table LIKE 'virhang_%' ORDER BY 1,2,3;
SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role');
SELECT pg_get_userbyid(member) AS member_role,pg_get_userbyid(roleid) AS granted_role
FROM pg_auth_members
WHERE pg_get_userbyid(member) IN ('anon','authenticated','service_role');
COMMIT;
