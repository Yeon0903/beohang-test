-- READ ONLY. Run separately in the confirmed test project's SQL Editor.
-- Returns fixed-name structural facts and boolean flags only. Never returns member rows/IDs,
-- role counts, emails, tokens, constraint expressions, settings, or function bodies.
-- Unlike report 05 this DOES read member/track rows internally to test integrity. Share only the JSON cell.
-- Not a migration; it adds/changes/deletes nothing. Missing core tables -> stop, do not invent a schema.
WITH profile_id AS (
 SELECT attnum FROM pg_attribute WHERE attrelid='public.virhang_users'::regclass AND attname='id' AND NOT attisdropped
), auth_id AS (
 SELECT attnum FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attname='id' AND NOT attisdropped
), profile_role AS (
 SELECT attnum,attnotnull FROM pg_attribute WHERE attrelid='public.virhang_users'::regclass AND attname='role' AND NOT attisdropped
), exact_auth_fk AS (
 SELECT k.convalidated,k.confdeltype FROM pg_constraint k
 WHERE k.conrelid='public.virhang_users'::regclass AND k.confrelid='auth.users'::regclass AND k.contype='f'
 AND k.conkey=ARRAY[(SELECT attnum FROM profile_id)]::smallint[]
 AND k.confkey=ARRAY[(SELECT attnum FROM auth_id)]::smallint[]
), inspected_definers(signature) AS (
 VALUES ('public.virhang_my_profile()'),('public.virhang_admin_streamer_account(text,text)'),('public.virhang_create_profile_on_signup()')
)
SELECT jsonb_build_object(
 'report_version',1,'scope','integrity-booleans-only',
 'profile_id_is_single_primary_key',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.virhang_users'::regclass AND contype='p' AND conkey=ARRAY[(SELECT attnum FROM profile_id)]::smallint[]),
 'exact_auth_id_fk_exists',EXISTS(SELECT 1 FROM exact_auth_fk),
 'exact_auth_id_fk_validated',EXISTS(SELECT 1 FROM exact_auth_fk WHERE convalidated),
 'exact_auth_fk_delete_actions',COALESCE((SELECT jsonb_agg(DISTINCT CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE 'REVIEW' END) FROM exact_auth_fk),'[]'::jsonb),
 'role_not_null',COALESCE((SELECT attnotnull FROM profile_role),false),
 'role_has_check_constraint',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.virhang_users'::regclass AND contype='c' AND (SELECT attnum FROM profile_role)=ANY(conkey)),
 'role_default_is_viewer',EXISTS(SELECT 1 FROM pg_attrdef WHERE adrelid='public.virhang_users'::regclass AND adnum=(SELECT attnum FROM profile_role) AND pg_get_expr(adbin,adrelid)='''viewer''::text'),
 'service_role_public_schema_usage',has_schema_privilege('service_role','public','USAGE'),
 'service_role_profile_lookup_select',has_column_privilege('service_role','public.virhang_users','id','SELECT') AND has_column_privilege('service_role','public.virhang_users','username','SELECT'),
 'profile_definer_owner_rls_bypass',(SELECT jsonb_object_agg(e.signature,COALESCE(r.rolsuper OR r.rolbypassrls OR (p.proowner=c.relowner AND NOT c.relforcerowsecurity),false))
   FROM inspected_definers e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) LEFT JOIN pg_roles r ON r.oid=p.proowner CROSS JOIN pg_class c WHERE c.oid='public.virhang_users'::regclass),
 'any_profile_without_auth_user',EXISTS(SELECT 1 FROM public.virhang_users p WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p.id)),
 'any_auth_user_without_profile',EXISTS(SELECT 1 FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM public.virhang_users p WHERE p.id=a.id)),
 'any_profile_invalid_username',EXISTS(SELECT 1 FROM public.virhang_users WHERE username IS NULL OR username !~ '^[a-z0-9]{4,20}$'),
 'any_profile_null_or_unknown_role',EXISTS(SELECT 1 FROM public.virhang_users WHERE role IS NULL OR role NOT IN ('viewer','streamer','admin','super_admin')),
 'super_admin_profile_present',EXISTS(SELECT 1 FROM public.virhang_users WHERE role='super_admin'),
 'any_track_missing_auth_owner',EXISTS(SELECT 1 FROM public.virhang_published_tracks t WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=t.created_by)),
 'any_track_missing_profile_owner',EXISTS(SELECT 1 FROM public.virhang_published_tracks t WHERE NOT EXISTS(SELECT 1 FROM public.virhang_users p WHERE p.id=t.created_by)),
 'any_track_singer_null_or_blank',EXISTS(SELECT 1 FROM public.virhang_published_tracks WHERE singer IS NULL OR btrim(singer)=''),
 'any_singer_token_exceeds_artist_key_limit',EXISTS(SELECT 1 FROM public.virhang_published_tracks t CROSS JOIN LATERAL regexp_split_to_table(t.singer,'[,，、·]+') raw(value) WHERE char_length(lower(btrim(raw.value)))>100),
 'private_definition_review_still_required',true
) AS virhang_integrity_report;
