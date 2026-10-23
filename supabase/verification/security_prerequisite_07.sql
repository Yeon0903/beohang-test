-- Read-only POSTCHECK, only after approved 000 and optional subsequent 001..004.
-- Member/track data are read internally, but only booleans/fixed metadata are returned.
-- No member rows/IDs, row counts, tokens, function bodies, or secret settings are returned.
-- Missing newly required tables/functions -> stop, do not run guessed repair SQL.
SELECT jsonb_build_object(
 'report_version',1,'scope','prerequisite-postcheck-booleans',
 'super_admin_present',EXISTS(SELECT 1 FROM public.virhang_users WHERE role='super_admin'),
 'auth_only_accounts_present',EXISTS(SELECT 1 FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM public.virhang_users p WHERE p.id=a.id)),
 'profile_orphans_present',EXISTS(SELECT 1 FROM public.virhang_users p WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p.id)),
 'invalid_profile_roles_present',EXISTS(SELECT 1 FROM public.virhang_users WHERE role IS NULL OR role NOT IN ('viewer','streamer','admin','super_admin')),
 'missing_credit_present',EXISTS(SELECT 1 FROM public.virhang_published_tracks t CROSS JOIN LATERAL regexp_split_to_table(t.singer,'[,，、·]+') raw(value)
  WHERE btrim(raw.value)<>'' AND NOT EXISTS(SELECT 1 FROM public.virhang_song_singers s WHERE s.track_id=t.id AND s.artist_key=lower(btrim(raw.value)))),
 'invalid_soft_delete_state_present',EXISTS(SELECT 1 FROM public.virhang_published_tracks WHERE is_deleted IS NULL OR (is_deleted AND deleted_at IS NULL) OR (NOT is_deleted AND deleted_at IS NOT NULL)),
 'client_direct_delete_granted',has_table_privilege('anon','public.virhang_published_tracks','DELETE') OR has_table_privilege('authenticated','public.virhang_published_tracks','DELETE'),
 'client_truncate_granted',has_table_privilege('anon','public.virhang_published_tracks','TRUNCATE') OR has_table_privilege('authenticated','public.virhang_published_tracks','TRUNCATE'),
 'client_verification_ids_readable',EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) roles(name)
  CROSS JOIN (VALUES('verified_user_id'),('verified_by'),('verified_at')) fields(name)
  WHERE has_column_privilege(roles.name,'public.virhang_artist_identities',fields.name,'SELECT')),
 'client_credit_writes_granted',EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) roles(name)
  WHERE has_any_column_privilege(roles.name,'public.virhang_song_singers','INSERT') OR has_any_column_privilege(roles.name,'public.virhang_song_singers','UPDATE') OR has_table_privilege(roles.name,'public.virhang_song_singers','DELETE')),
 'client_trigger_rpc_executable',EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) roles(name)
  CROSS JOIN (VALUES('public.virhang_sync_song_singers()'),('public.virhang_validate_track_write()')) functions(signature)
  WHERE has_function_privilege(roles.name,functions.signature,'EXECUTE')),
 'sync_trigger_active',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.virhang_published_tracks'::regclass AND tgname='virhang_song_singers_sync'
  AND tgfoid='public.virhang_sync_song_singers()'::regprocedure AND tgenabled IN ('O','A') AND tgtype=21),
 'write_guard_active',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.virhang_published_tracks'::regclass AND tgname='virhang_validate_track_write'
  AND tgfoid='public.virhang_validate_track_write()'::regprocedure AND tgenabled IN ('O','A') AND tgtype=23),
 'service_profile_lookup_select',has_column_privilege('service_role','public.virhang_users','id','SELECT') AND has_column_privilege('service_role','public.virhang_users','username','SELECT'),
 'function_body_and_live_jwt_tests_still_required',true
) AS virhang_prerequisite_report;
