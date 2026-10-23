-- VirHang prerequisite 000: apply BEFORE the unchanged 001..004, after staging approval.
-- Standalone COMMIT is safe: hardened admin/write RPCs, no direct DELETE, private verification IDs.
-- Intentional early copies of 001/002 hardening avoid exposing legacy JOINT's vulnerable middle state.
-- No Auth/profile/library/listening data writes, role changes, account matching, or Auth FK changes.
-- Only additive track columns and INSERT-only credit backfill. See docs/SECURITY_PREREQUISITE_07.md.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE item record; rel oid;
BEGIN
 -- Check exact base column types; do not fabricate an unknown baseline or coerce existing data.
 FOR item IN SELECT * FROM (VALUES
  ('virhang_users','id','uuid'),('virhang_users','username','text'),
  ('virhang_users','display_name','text'),('virhang_users','role','text'),('virhang_users','updated_at','timestamptz'),
  ('virhang_published_tracks','id','uuid'),('virhang_published_tracks','created_by','uuid'),
  ('virhang_published_tracks','created_at','timestamptz'),('virhang_published_tracks','updated_at','timestamptz'),
  ('virhang_published_tracks','title','text'),('virhang_published_tracks','singer','text'),
  ('virhang_published_tracks','album','text'),('virhang_published_tracks','platform','text'),
  ('virhang_published_tracks','source_url','text'),('virhang_published_tracks','artwork_url','text'),
  ('virhang_published_tracks','genre','text'),('virhang_published_tracks','details','text[]'),
  ('virhang_published_tracks','song_type','text'),('virhang_published_tracks','description','text'),
  ('virhang_published_tracks','lyrics','text'),('virhang_published_tracks','original_url','text'),
  ('virhang_account_libraries','user_id','uuid'),('virhang_account_libraries','likes','jsonb'),
  ('virhang_account_libraries','playlists','jsonb'),('virhang_account_libraries','updated_at','timestamptz'),
  ('virhang_rank_listens','id','uuid'),('virhang_rank_listens','user_id','uuid'),
  ('virhang_rank_listens','track_id','uuid'),('virhang_rank_listens','started_at','timestamptz'),
  ('virhang_rank_listens','finished_at','timestamptz')
 ) e(table_name,column_name,type_name) LOOP
  rel:=to_regclass('public.'||item.table_name);
  IF rel IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=rel AND relkind='r')
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname=item.column_name
    AND atttypid=to_regtype(item.type_name) AND attnum>0 AND NOT attisdropped) THEN
   RAISE EXCEPTION 'Prerequisite base schema mismatch: %.%',item.table_name,item.column_name USING ERRCODE='55000';
  END IF;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES ('public.virhang_users'),('public.virhang_published_tracks'),('auth.users')) e(name) LOOP
  rel:=to_regclass(item.name);
  IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=rel AND k.contype='p'
   AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=rel AND attname='id')]::smallint[]) THEN
   RAISE EXCEPTION 'Review prerequisite id primary key: %',item.name USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF to_regprocedure('public.virhang_admin_streamer_account(text,text)') IS NULL
  OR to_regprocedure('public.virhang_my_profile()') IS NULL
  OR to_regprocedure('public.virhang_create_profile_on_signup()') IS NULL THEN
  RAISE EXCEPTION 'Review existing account/signup RPC baseline first' USING ERRCODE='55000';
 END IF;
END $$;

-- Serialize the backfill with writes to these two existing tables. No UPDATE of their old rows.
LOCK TABLE public.virhang_users,public.virhang_published_tracks IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='public.virhang_users'::regclass
  AND i.indisunique AND i.indisvalid AND i.indnatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL
  AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='username')) THEN
  RAISE EXCEPTION 'Review existing unique username constraint' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.virhang_users WHERE username IS NULL OR username !~ '^[a-z0-9]{4,20}$'
  OR role IS NULL OR role NOT IN ('viewer','streamer','admin','super_admin'))
  OR EXISTS(SELECT 1 FROM public.virhang_users p WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p.id)) THEN
  RAISE EXCEPTION 'Review profile integrity privately; no accounts will be repaired automatically' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.virhang_users WHERE role='super_admin') THEN
  RAISE EXCEPTION 'Confirm existing super administrator before prerequisite migration' USING ERRCODE='55000';
 END IF;
 IF NOT has_schema_privilege('service_role','public','USAGE')
  OR NOT has_column_privilege('service_role','public.virhang_users','id','SELECT')
  OR NOT has_column_privilege('service_role','public.virhang_users','username','SELECT') THEN
  RAISE EXCEPTION 'Review login service profile lookup privileges first' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.virhang_published_tracks t WHERE singer IS NULL OR btrim(singer)=''
   OR NOT EXISTS(SELECT 1 FROM public.virhang_users p WHERE p.id=t.created_by)
   OR NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=t.created_by))
  OR EXISTS(SELECT 1 FROM public.virhang_published_tracks t CROSS JOIN LATERAL regexp_split_to_table(t.singer,'[,，、·]+') raw(value)
    WHERE char_length(lower(btrim(raw.value)))>100) THEN
  RAISE EXCEPTION 'Review legacy singer/owner integrity; existing songs will not be rewritten' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.virhang_published_tracks'::regclass AND NOT tgisinternal
  AND tgname NOT IN ('virhang_song_singers_sync','virhang_validate_track_write')) THEN
  RAISE EXCEPTION 'Review additional track triggers before prerequisite migration' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger t JOIN (VALUES
   ('virhang_song_singers_sync','public.virhang_sync_song_singers()',21),
   ('virhang_validate_track_write','public.virhang_validate_track_write()',23)
  ) expected(name,signature,event_type) ON t.tgname=expected.name
  WHERE t.tgrelid='public.virhang_published_tracks'::regclass AND NOT t.tgisinternal
   AND (t.tgfoid IS DISTINCT FROM to_regprocedure(expected.signature) OR t.tgtype<>expected.event_type OR t.tgenabled NOT IN ('O','A'))) THEN
  RAISE EXCEPTION 'Review incompatible existing track trigger binding' USING ERRCODE='55000';
 END IF;
 -- CREATE OR REPLACE retains an existing function owner. Do not assume it bypasses profile RLS.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  CROSS JOIN pg_class c WHERE n.nspname='public' AND c.oid='public.virhang_users'::regclass
   AND p.oid IN (SELECT to_regprocedure(signature) FROM (VALUES
    ('public.virhang_admin_streamer_account(text,text)'),('public.virhang_admin_link_artist(text,text,text)'),
    ('public.virhang_sync_song_singers()'),('public.virhang_can_publish()'),
    ('public.virhang_can_manage_published_track(uuid,uuid)'),('public.virhang_my_manageable_track_ids()'),
    ('public.virhang_validate_track_write()')) functions(signature))
   AND (NOT (r.rolsuper OR r.rolbypassrls OR (p.proowner=c.relowner AND NOT c.relforcerowsecurity))
    OR NOT has_table_privilege(p.proowner,c.oid,'SELECT'))) THEN
  RAISE EXCEPTION 'Review existing definer ownership/privileges privately' USING ERRCODE='55000';
 END IF;
END $$;

ALTER TABLE public.virhang_published_tracks ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.virhang_published_tracks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS public.virhang_artist_identities (
 artist_key text PRIMARY KEY CHECK(char_length(artist_key) BETWEEN 1 AND 100),
 display_name text NOT NULL,
 verified_user_id uuid UNIQUE REFERENCES public.virhang_users(id) ON DELETE SET NULL,
 verified_by uuid REFERENCES public.virhang_users(id),
 verified_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.virhang_song_singers (
 track_id uuid NOT NULL REFERENCES public.virhang_published_tracks(id) ON DELETE CASCADE,
 artist_key text NOT NULL REFERENCES public.virhang_artist_identities(artist_key) ON DELETE RESTRICT,
 PRIMARY KEY(track_id,artist_key)
);
CREATE INDEX IF NOT EXISTS virhang_song_singers_artist_idx ON public.virhang_song_singers(artist_key);

-- IF NOT EXISTS alone does not establish compatibility. A partial/wrong prior setup fails atomically.
DO $$
DECLARE item record; rel oid; col smallint;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('virhang_artist_identities','artist_key','text',true),('virhang_artist_identities','display_name','text',true),
  ('virhang_artist_identities','verified_user_id','uuid',false),('virhang_artist_identities','verified_by','uuid',false),
  ('virhang_artist_identities','verified_at','timestamptz',false),
  ('virhang_song_singers','track_id','uuid',true),('virhang_song_singers','artist_key','text',true),
  ('virhang_published_tracks','is_deleted','boolean',true),('virhang_published_tracks','deleted_at','timestamptz',false)
 ) e(table_name,column_name,type_name,not_null) LOOP
  rel:=to_regclass('public.'||item.table_name);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=rel AND relkind='r')
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname=item.column_name AND NOT attisdropped
    AND atttypid=to_regtype(item.type_name) AND attnotnull=item.not_null AND attgenerated='') THEN
   RAISE EXCEPTION 'Existing prerequisite object is incompatible: %.%',item.table_name,item.column_name USING ERRCODE='55000';
  END IF;
 END LOOP;
 -- An existing verification DEFAULT could silently link newly backfilled singers to an account.
 -- Both this file and immutable 001's future sync inserts must retain the original NULL defaults.
 IF EXISTS(SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
  WHERE d.adrelid='public.virhang_artist_identities'::regclass AND a.attname IN ('verified_user_id','verified_by','verified_at')) THEN
  RAISE EXCEPTION 'Review verification column defaults; automatic account linking is forbidden' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
  WHERE d.adrelid='public.virhang_published_tracks'::regclass AND a.attname='is_deleted' AND pg_get_expr(d.adbin,d.adrelid)='false') THEN
  RAISE EXCEPTION 'Review existing soft-delete default' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.virhang_published_tracks WHERE is_deleted IS NULL
  OR (is_deleted AND deleted_at IS NULL) OR (NOT is_deleted AND deleted_at IS NOT NULL)) THEN
  RAISE EXCEPTION 'Review existing soft-delete state; no rows will be repaired automatically' USING ERRCODE='55000';
 END IF;
 FOR item IN SELECT * FROM (VALUES
  ('public.virhang_artist_identities',ARRAY['artist_key']),('public.virhang_song_singers',ARRAY['track_id','artist_key'])
 ) e(name,columns) LOOP
  rel:=to_regclass(item.name);
  IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=rel AND k.contype='p'
   AND k.conkey=ARRAY(SELECT a.attnum FROM unnest(item.columns) WITH ORDINALITY cols(name,ord)
    JOIN pg_attribute a ON a.attrelid=rel AND a.attname=cols.name ORDER BY cols.ord)) THEN
   RAISE EXCEPTION 'Review existing credit primary key: %',item.name USING ERRCODE='55000';
  END IF;
 END LOOP;
 rel:='public.virhang_artist_identities'::regclass;
 SELECT attnum INTO col FROM pg_attribute WHERE attrelid=rel AND attname='verified_user_id';
 IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indrelid=rel AND indisunique AND indisvalid AND indnatts=1
  AND indpred IS NULL AND indexprs IS NULL AND indkey[0]=col) THEN
  RAISE EXCEPTION 'Review unique verified account constraint' USING ERRCODE='55000';
 END IF;
 FOR item IN SELECT * FROM (VALUES
  ('public.virhang_artist_identities','verified_user_id','public.virhang_users','id','n'),
  ('public.virhang_artist_identities','verified_by','public.virhang_users','id','a'),
  ('public.virhang_song_singers','track_id','public.virhang_published_tracks','id','c'),
  ('public.virhang_song_singers','artist_key','public.virhang_artist_identities','artist_key','r')
 ) e(source_table,source_column,target_table,target_column,delete_action) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.contype='f' AND k.convalidated
   AND k.conrelid=to_regclass(item.source_table) AND k.confrelid=to_regclass(item.target_table)
   AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname=item.source_column)]::smallint[]
   AND k.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.confrelid AND attname=item.target_column)]::smallint[]
   AND k.confdeltype::text=item.delete_action) THEN
   RAISE EXCEPTION 'Review existing credit foreign key: %.%',item.source_table,item.source_column USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.virhang_artist_identities'::regclass,'public.virhang_song_singers'::regclass) AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Review additional credit triggers before backfill' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.virhang_song_singers_artist_idx')
  AND i.indrelid='public.virhang_song_singers'::regclass AND i.indisvalid AND i.indnatts=1 AND i.indpred IS NULL
  AND i.indexprs IS NULL AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='artist_key')) THEN
  RAISE EXCEPTION 'Review existing singer lookup index' USING ERRCODE='55000';
 END IF;
END $$;

-- INSERT-only: keep every preexisting credit/link/verification timestamp, including manual additions.
INSERT INTO public.virhang_artist_identities(artist_key,display_name)
SELECT DISTINCT lower(btrim(raw.value)),btrim(raw.value)
FROM public.virhang_published_tracks t CROSS JOIN LATERAL regexp_split_to_table(t.singer,'[,，、·]+') raw(value)
WHERE btrim(raw.value)<>'' ON CONFLICT(artist_key) DO NOTHING;
INSERT INTO public.virhang_song_singers(track_id,artist_key)
SELECT DISTINCT t.id,lower(btrim(raw.value))
FROM public.virhang_published_tracks t CROSS JOIN LATERAL regexp_split_to_table(t.singer,'[,，、·]+') raw(value)
WHERE btrim(raw.value)<>'' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.virhang_can_publish()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.virhang_users WHERE id=auth.uid() AND role IN ('streamer','admin','super_admin'));
$$;
REVOKE ALL ON FUNCTION public.virhang_can_publish() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_can_publish() TO authenticated;

CREATE OR REPLACE FUNCTION public.virhang_can_manage_published_track(p_track_id uuid,p_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.virhang_users me JOIN public.virhang_published_tracks t ON t.id=p_track_id
  WHERE me.id=auth.uid() AND t.created_by=p_owner_id AND (
   me.role IN ('admin','super_admin') OR (me.role='streamer' AND (
    t.created_by=me.id OR EXISTS(SELECT 1 FROM public.virhang_song_singers ss
     JOIN public.virhang_artist_identities ai ON ai.artist_key=ss.artist_key
     WHERE ss.track_id=t.id AND ai.verified_user_id=me.id)
   ))));
$$;
REVOKE ALL ON FUNCTION public.virhang_can_manage_published_track(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_can_manage_published_track(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.virhang_my_manageable_track_ids()
RETURNS TABLE(track_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT t.id FROM public.virhang_published_tracks t WHERE public.virhang_can_manage_published_track(t.id,t.created_by);
$$;
REVOKE ALL ON FUNCTION public.virhang_my_manageable_track_ids() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_my_manageable_track_ids() TO authenticated;

-- Early hardening from immutable 001/002 follows; no legacy vulnerable function is installed.
CREATE OR REPLACE FUNCTION public.virhang_admin_streamer_account(
  p_username text, p_action text
)
RETURNS TABLE(username text, display_name text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE caller_role text; target_id uuid; target_role text;
BEGIN
  SELECT v.role INTO caller_role FROM public.virhang_users v WHERE v.id = (SELECT auth.uid());
  IF auth.uid() IS NULL OR caller_role IS NULL OR caller_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE='42501';
  END IF;
  IF p_username IS NULL OR p_username !~ '^[a-z0-9]{4,20}$' THEN
    RAISE EXCEPTION '올바른 아이디를 입력해 주세요.' USING ERRCODE='22023';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('lookup','grant','revoke') THEN
    RAISE EXCEPTION '허용되지 않은 요청입니다.' USING ERRCODE='22023';
  END IF;
  SELECT v.id,v.role INTO target_id,target_role
  FROM public.virhang_users v WHERE v.username=p_username FOR UPDATE;
  IF target_id IS NULL THEN
    RAISE EXCEPTION '가입된 버항 아이디가 없습니다.' USING ERRCODE='P0002';
  END IF;
  IF p_action='grant' THEN
    IF target_role IS NULL OR target_role NOT IN ('viewer','streamer') THEN
      RAISE EXCEPTION '관리자 계정의 권한을 변경할 수 없습니다.' USING ERRCODE='42501';
    END IF;
    UPDATE public.virhang_users v SET role='streamer', updated_at=now() WHERE v.id=target_id AND v.role='viewer';
  ELSIF p_action='revoke' THEN
    IF target_role IS DISTINCT FROM 'streamer' THEN
      RAISE EXCEPTION '스트리머 계정만 일반 회원으로 변경할 수 있습니다.' USING ERRCODE='42501';
    END IF;
    UPDATE public.virhang_users v SET role='viewer', updated_at=now() WHERE v.id=target_id;
  END IF;
  RETURN QUERY SELECT v.username,v.display_name,v.role FROM public.virhang_users v WHERE v.id=target_id;
END;
$$;
REVOKE ALL ON FUNCTION public.virhang_admin_streamer_account(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.virhang_admin_streamer_account(text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.virhang_admin_link_artist(
  p_artist_name text, p_username text, p_action text DEFAULT 'link'
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE requester_role text; target_id uuid; target_role text; norm text;
BEGIN
 SELECT role INTO requester_role FROM public.virhang_users WHERE id=auth.uid();
 IF auth.uid() IS NULL OR requester_role IS NULL OR requester_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION '관리자만 가수 계정 연결을 할 수 있습니다.' USING ERRCODE='42501'; END IF;
 norm:=lower(btrim(p_artist_name));
 IF norm IS NULL OR length(norm)<1 OR length(norm)>100 THEN RAISE EXCEPTION '가수 이름을 확인해 주세요.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.virhang_artist_identities WHERE artist_key=norm) THEN
   RAISE EXCEPTION '해당 이름으로 등록된 참여곡이 없습니다.';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('link','unlink') THEN RAISE EXCEPTION '지원하지 않는 작업입니다.' USING ERRCODE='22023'; END IF;
 IF p_action='unlink' THEN
   UPDATE public.virhang_artist_identities SET verified_user_id=NULL,verified_by=NULL,verified_at=NULL WHERE artist_key=norm;
   RETURN '가수와 계정 연결을 해제했습니다.';
 ELSIF p_action<>'link' THEN RAISE EXCEPTION '지원하지 않는 작업입니다.'; END IF;
 IF p_username IS NULL OR p_username !~ '^[a-z0-9]{4,20}$' THEN RAISE EXCEPTION '올바른 버항 아이디를 입력해 주세요.'; END IF;
 SELECT id,role INTO target_id,target_role FROM public.virhang_users WHERE username=p_username;
 IF target_id IS NULL THEN RAISE EXCEPTION '아직 가입하지 않은 계정입니다. 회원 가입 후 연결해 주세요.'; END IF;
 IF target_role IS NULL OR target_role NOT IN ('streamer','admin','super_admin') THEN RAISE EXCEPTION '스트리머로 승인된 계정만 가수에 연결할 수 있습니다.'; END IF;
 IF EXISTS(SELECT 1 FROM public.virhang_artist_identities WHERE verified_user_id=target_id AND artist_key<>norm) THEN
   RAISE EXCEPTION '이 계정은 다른 가수와 이미 연결되어 있습니다. 운영진에게 확인하세요.';
 END IF;
 UPDATE public.virhang_artist_identities
 SET verified_user_id=target_id,verified_by=auth.uid(),verified_at=now() WHERE artist_key=norm;
 RETURN format('%s 가수와 %s 계정을 연결했습니다. 기존 참여곡에도 즉시 관리 권한이 생깁니다.', p_artist_name,p_username);
END; $$;
REVOKE ALL ON FUNCTION public.virhang_admin_link_artist(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_admin_link_artist(text,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.virhang_sync_song_singers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE singer_text text; singer_key text; actor_role text;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION '곡 ID와 최초 등록자는 변경할 수 없습니다.' USING ERRCODE='42501';
  END IF;
  SELECT role INTO actor_role FROM public.virhang_users WHERE id=auth.uid();
  -- 수정된 가수 목록에서 빠진 인증된 참가자는 관리자만 제거 가능
  IF TG_OP='UPDATE' AND COALESCE(actor_role IN ('admin','super_admin'),false)=false THEN
    IF EXISTS (
      SELECT 1 FROM public.virhang_song_singers ss JOIN public.virhang_artist_identities ai USING(artist_key)
      WHERE ss.track_id=NEW.id AND ai.verified_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM regexp_split_to_table(NEW.singer,'[,，、·]+') AS raw(value)
        WHERE lower(btrim(raw.value))=ss.artist_key
      )
    ) THEN RAISE EXCEPTION '인증된 참여 가수 제거는 관리자 확인이 필요합니다.' USING ERRCODE='42501'; END IF;
  END IF;
  FOR singer_text IN SELECT btrim(value) FROM regexp_split_to_table(NEW.singer,'[,，、·]+') AS t(value) LOOP
    singer_key:=lower(singer_text);
    IF singer_key<>'' THEN
      INSERT INTO public.virhang_artist_identities(artist_key,display_name)
      VALUES(singer_key,singer_text) ON CONFLICT(artist_key) DO NOTHING;
      INSERT INTO public.virhang_song_singers(track_id,artist_key) VALUES(NEW.id,singer_key)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  DELETE FROM public.virhang_song_singers ss WHERE ss.track_id=NEW.id
   AND NOT EXISTS(SELECT 1 FROM regexp_split_to_table(NEW.singer,'[,，、·]+') AS raw(value)
     WHERE lower(btrim(raw.value))=ss.artist_key);
  RETURN NULL;
END; $$;

-- Trigger-only function: never an exposed application RPC.
REVOKE ALL ON FUNCTION public.virhang_sync_song_singers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.virhang_valid_https_url(p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT COALESCE(char_length(p_url) BETWEEN 12 AND 2000
  AND p_url ~ '^https://([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}([/?#][^[:space:]<>"''`\\]*)?$'
  AND p_url !~* '%(0[0-9a-f]|1[0-9a-f]|7f)',false);
$$;
CREATE OR REPLACE FUNCTION public.virhang_valid_video_url(p_url text,p_platform text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT public.virhang_valid_https_url(p_url) AND COALESCE(CASE p_platform
 WHEN 'youtube' THEN p_url ~ '^https://((www\.|m\.|music\.)?youtube\.com/(watch\?v=[A-Za-z0-9_-]{11}(&[^#]*)?|(shorts|live|embed)/[A-Za-z0-9_-]{11}([/?#].*)?)|youtu\.be/[A-Za-z0-9_-]{11}([/?#].*)?)$'
 WHEN 'soop' THEN p_url ~ '^https://([a-zA-Z0-9-]+\.)*(sooplive|afreecatv)\.com/.+'
  AND (p_url ~ '^https://vod\.(sooplive|afreecatv)\.com/player/[0-9]+(/playlist/[0-9]+)?/?([?#].*)?$'
   OR p_url ~* '^https://[^/]*(clip|catch)[^/]*/.+'
   OR p_url ~* '^https://[^/]+/[^?#]*(clip|catch)[^?#]*')
 ELSE false END,false);
$$;
CREATE OR REPLACE FUNCTION public.virhang_valid_plain_text(p_text text,p_min integer,p_max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT COALESCE(char_length(btrim(p_text))>=p_min AND char_length(p_text)<=p_max
 AND p_text !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
 AND p_text !~ '<[[:space:]]*[/!?a-zA-Z]',false);
$$;
REVOKE ALL ON FUNCTION public.virhang_valid_https_url(text),public.virhang_valid_video_url(text,text),public.virhang_valid_plain_text(text,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.virhang_validate_track_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); actor_role text;
BEGIN
 SELECT role INTO actor_role FROM public.virhang_users WHERE id=actor;
 IF actor IS NULL OR actor_role IS NULL OR actor_role NOT IN ('streamer','admin','super_admin') THEN
  RAISE EXCEPTION '승인된 스트리머 또는 관리자만 곡을 관리할 수 있습니다.' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by IS DISTINCT FROM actor OR NEW.is_deleted THEN
   RAISE EXCEPTION '등록자 및 최초 공개 상태를 확인하세요.' USING ERRCODE='42501';
  END IF;
  NEW.created_at:=now(); NEW.deleted_at:=NULL;
 ELSE
  IF NOT public.virhang_can_manage_published_track(OLD.id,OLD.created_by) THEN
   RAISE EXCEPTION '곡 관리 권한이 없습니다.' USING ERRCODE='42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION '곡 ID, 최초 등록자 및 등록 시각은 변경할 수 없습니다.' USING ERRCODE='42501';
  END IF;
  IF OLD.is_deleted AND (NEW.is_deleted OR actor_role NOT IN ('admin','super_admin')) THEN
   RAISE EXCEPTION '삭제된 곡은 관리자 복구 후 수정할 수 있습니다.' USING ERRCODE='42501';
  END IF;
 END IF;
 -- A soft-delete of a legacy row must remain possible even if its metadata is invalid.
 IF TG_OP='INSERT' OR NOT NEW.is_deleted OR (to_jsonb(NEW)-ARRAY['is_deleted','deleted_at','updated_at']) IS DISTINCT FROM
                         (to_jsonb(OLD)-ARRAY['is_deleted','deleted_at','updated_at']) THEN
  IF NOT public.virhang_valid_plain_text(NEW.title,1,80)
   OR NOT public.virhang_valid_plain_text(NEW.singer,1,50)
   OR NOT public.virhang_valid_plain_text(NEW.album,0,80)
   OR NOT public.virhang_valid_plain_text(NEW.description,0,1200)
   OR NOT public.virhang_valid_plain_text(NEW.lyrics,0,50000)
   OR NEW.genre IS NULL OR NEW.genre NOT IN ('K-POP','J-POP','POP','보컬로이드')
   OR NEW.song_type IS NULL OR NEW.song_type NOT IN ('커버곡','오리지널곡')
   OR NEW.details IS NULL OR cardinality(NEW.details)>9 OR array_position(NEW.details,NULL) IS NOT NULL
   OR NOT NEW.details <@ ARRAY['발라드','록','댄스','랩','힙합','R&B','재즈','어쿠스틱','기타']::text[]
   OR NOT public.virhang_valid_video_url(NEW.source_url,NEW.platform)
   OR NEW.artwork_url IS NULL OR (NEW.artwork_url<>'' AND NOT public.virhang_valid_https_url(NEW.artwork_url))
   OR NEW.original_url IS NULL OR (NEW.original_url<>'' AND NOT public.virhang_valid_video_url(NEW.original_url,'youtube')) THEN
   RAISE EXCEPTION '곡 정보의 형식, 길이 또는 URL을 확인해 주세요.' USING ERRCODE='22023';
  END IF;
 END IF;
 IF NEW.is_deleted THEN NEW.deleted_at:=now(); ELSE NEW.deleted_at:=NULL; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.virhang_validate_track_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS virhang_validate_track_write ON public.virhang_published_tracks;
CREATE TRIGGER virhang_validate_track_write BEFORE INSERT OR UPDATE ON public.virhang_published_tracks
 FOR EACH ROW EXECUTE FUNCTION public.virhang_validate_track_write();

-- Restrictive policies also constrain any legacy permissive policy left in the DB.
ALTER TABLE public.virhang_published_tracks ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.virhang_published_tracks FROM PUBLIC,anon;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.virhang_published_tracks FROM authenticated;
GRANT SELECT ON public.virhang_published_tracks TO anon,authenticated;
DROP POLICY IF EXISTS virhang_public_tracks_read ON public.virhang_published_tracks;
CREATE POLICY virhang_public_tracks_read ON public.virhang_published_tracks FOR SELECT TO anon,authenticated USING(NOT is_deleted);
DROP POLICY IF EXISTS virhang_manage_deleted_read ON public.virhang_published_tracks;
CREATE POLICY virhang_manage_deleted_read ON public.virhang_published_tracks FOR SELECT TO authenticated
 USING(public.virhang_can_manage_published_track(id,created_by));
DROP POLICY IF EXISTS virhang_track_read_guard ON public.virhang_published_tracks;
CREATE POLICY virhang_track_read_guard ON public.virhang_published_tracks AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(NOT is_deleted OR public.virhang_can_manage_published_track(id,created_by));
-- This boolean helper returns false for anon/missing profiles; no account details.
GRANT EXECUTE ON FUNCTION public.virhang_can_manage_published_track(uuid,uuid) TO anon;
DROP POLICY IF EXISTS virhang_track_insert_guard ON public.virhang_published_tracks;
CREATE POLICY virhang_track_insert_guard ON public.virhang_published_tracks AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND public.virhang_can_publish());
DROP POLICY IF EXISTS virhang_track_update_guard ON public.virhang_published_tracks;
CREATE POLICY virhang_track_update_guard ON public.virhang_published_tracks AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.virhang_can_manage_published_track(id,created_by)) WITH CHECK(public.virhang_can_manage_published_track(id,created_by));
DROP POLICY IF EXISTS virhang_track_no_delete ON public.virhang_published_tracks;
CREATE POLICY virhang_track_no_delete ON public.virhang_published_tracks AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);

-- Preserve listening history, exclude deleted/non-YouTube tracks from new counts and public rankings.
CREATE OR REPLACE FUNCTION public.virhang_rank_start(p_track_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_event uuid;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(SELECT 1 FROM public.virhang_users WHERE id=v_user AND role IN ('viewer','streamer','admin','super_admin')) THEN RAISE EXCEPTION 'Profile required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.virhang_published_tracks t WHERE t.id=p_track_id AND t.platform='youtube' AND NOT t.is_deleted) THEN
   RAISE EXCEPTION 'Track not eligible'; END IF;
 -- Limit pending starts to reduce table spam.
 IF (SELECT count(*) FROM public.virhang_rank_listens x WHERE x.user_id=v_user AND x.started_at>now()-interval '1 minute')>=10 THEN
   RAISE EXCEPTION 'Too many play attempts'; END IF;
 -- Prune only stale, unfinished events for this member (preserve completed history).
 DELETE FROM public.virhang_rank_listens WHERE user_id=v_user AND finished_at IS NULL AND started_at < now()-interval '1 day';
 INSERT INTO public.virhang_rank_listens(user_id,track_id) VALUES(v_user,p_track_id) RETURNING id INTO v_event;
 RETURN v_event;
END; $$;

CREATE OR REPLACE FUNCTION public.virhang_rank_finish(p_event_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event public.virhang_rank_listens%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.virhang_users WHERE id=auth.uid() AND role IN ('viewer','streamer','admin','super_admin')) THEN RETURN false; END IF;
 SELECT * INTO v_event FROM public.virhang_rank_listens
 WHERE id=p_event_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_event.finished_at IS NOT NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.virhang_published_tracks WHERE id=v_event.track_id AND NOT is_deleted AND platform='youtube') THEN RETURN false; END IF;
 IF v_event.started_at > now()-interval '30 seconds' OR v_event.started_at < now()-interval '3 hours' THEN RETURN false; END IF;
 UPDATE public.virhang_rank_listens SET finished_at=now() WHERE id=p_event_id AND finished_at IS NULL;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.virhang_rank_get(p_mode text)
RETURNS TABLE(track_id uuid, score bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_start timestamptz; v_limit int:=50;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN ('realtime','daily','weekly','monthly','yearly','alltime','new') THEN
    RAISE EXCEPTION 'Ranking mode not yet supported'; END IF;
 CASE p_mode
 WHEN 'realtime' THEN v_start:=now()-interval '1 hour';
 WHEN 'daily' THEN v_start:=(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul');
 WHEN 'weekly' THEN v_start:=(date_trunc('week',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul');
 WHEN 'monthly' THEN v_start:=(date_trunc('month',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul');
 WHEN 'yearly' THEN v_start:=(date_trunc('year',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul');
 WHEN 'alltime' THEN v_start:='2000-01-01'::timestamptz; v_limit:=100;
 WHEN 'new' THEN v_start:=now()-interval '30 days';
 END CASE;
 RETURN QUERY SELECT e.track_id,count(*)::bigint AS score FROM public.virhang_rank_listens e
 JOIN public.virhang_published_tracks t ON t.id=e.track_id
 WHERE NOT t.is_deleted AND t.platform='youtube' AND e.finished_at IS NOT NULL AND e.finished_at >= v_start
 AND (p_mode <> 'new' OR t.created_at>=now()-interval '30 days')
 GROUP BY e.track_id ORDER BY score DESC,e.track_id LIMIT v_limit;
END; $$;
REVOKE ALL ON FUNCTION public.virhang_rank_start(uuid),public.virhang_rank_finish(uuid),public.virhang_rank_get(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_rank_start(uuid),public.virhang_rank_finish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_rank_get(text) TO anon,authenticated;


-- Install synchronization only after the hardened function and write guard exist.
DROP TRIGGER IF EXISTS virhang_song_singers_sync ON public.virhang_published_tracks;
CREATE TRIGGER virhang_song_singers_sync AFTER INSERT OR UPDATE OF singer,created_by,id
ON public.virhang_published_tracks FOR EACH ROW EXECUTE FUNCTION public.virhang_sync_song_singers();

ALTER TABLE public.virhang_artist_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virhang_song_singers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.virhang_artist_identities,public.virhang_song_singers FROM PUBLIC,anon,authenticated;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
  AND table_name IN ('virhang_artist_identities','virhang_song_singers') LOOP
  EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',c.column_name,c.table_name);
 END LOOP;
END $$;
GRANT SELECT(artist_key,display_name) ON public.virhang_artist_identities TO anon,authenticated;
GRANT SELECT(track_id,artist_key) ON public.virhang_song_singers TO anon,authenticated;
DROP POLICY IF EXISTS virhang_artist_identities_read ON public.virhang_artist_identities;
CREATE POLICY virhang_artist_identities_read ON public.virhang_artist_identities FOR SELECT TO anon,authenticated USING(true);
DROP POLICY IF EXISTS virhang_song_singers_read ON public.virhang_song_singers;
CREATE POLICY virhang_song_singers_read ON public.virhang_song_singers FOR SELECT TO anon,authenticated USING(true);

-- Keep the normal publisher path and enable verified co-singers through the server helper.
GRANT INSERT,UPDATE ON public.virhang_published_tracks TO authenticated;
DROP POLICY IF EXISTS virhang_published_tracks_update ON public.virhang_published_tracks;
CREATE POLICY virhang_published_tracks_update ON public.virhang_published_tracks FOR UPDATE TO authenticated
 USING(public.virhang_can_manage_published_track(id,created_by)) WITH CHECK(public.virhang_can_manage_published_track(id,created_by));
DROP POLICY IF EXISTS virhang_published_tracks_delete ON public.virhang_published_tracks;
-- DELETE is revoked and a restrictive false policy already exists, including during this file's sole COMMIT.
COMMIT;
