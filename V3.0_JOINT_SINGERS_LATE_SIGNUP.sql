-- V3.0 공동 참여 가수의 추후 가입 연동. 기존 곡/ID/재생 수/회원 삭제 없음.
-- 선행: V2.6.9_PUBLISHED_TRACKS_SETUP.sql (+ 사용 중이라면 랭킹 SQL)
BEGIN;
ALTER TABLE public.virhang_published_tracks ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.virhang_published_tracks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS public.virhang_artist_identities (
  artist_key text PRIMARY KEY,
  display_name text NOT NULL,
  verified_user_id uuid UNIQUE REFERENCES public.virhang_users(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES public.virhang_users(id),
  verified_at timestamptz,
  CHECK (length(artist_key) BETWEEN 1 AND 100)
);
CREATE TABLE IF NOT EXISTS public.virhang_song_singers (
  track_id uuid NOT NULL REFERENCES public.virhang_published_tracks(id) ON DELETE CASCADE,
  artist_key text NOT NULL REFERENCES public.virhang_artist_identities(artist_key) ON DELETE RESTRICT,
  PRIMARY KEY (track_id,artist_key)
);
CREATE INDEX IF NOT EXISTS virhang_song_singers_artist_idx ON public.virhang_song_singers(artist_key);
ALTER TABLE public.virhang_artist_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virhang_song_singers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.virhang_artist_identities, public.virhang_song_singers FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.virhang_artist_identities, public.virhang_song_singers TO anon,authenticated;
DROP POLICY IF EXISTS virhang_artist_identities_read ON public.virhang_artist_identities;
CREATE POLICY virhang_artist_identities_read ON public.virhang_artist_identities FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS virhang_song_singers_read ON public.virhang_song_singers;
CREATE POLICY virhang_song_singers_read ON public.virhang_song_singers FOR SELECT TO anon,authenticated USING (true);

-- 모든 신규 노래/기존 노래의 가수명을 개별 credit로 기록한다.
-- 검증된 참여 가수를 일반 스트리머가 임의로 제거해 관리 권한을 빼앗지 못하도록 보호.
CREATE OR REPLACE FUNCTION public.virhang_sync_song_singers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE singer_text text; singer_key text; actor_role text;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION '곡 ID와 최초 등록자는 변경할 수 없습니다.' USING ERRCODE='42501';
  END IF;
  SELECT role INTO actor_role FROM public.virhang_users WHERE id=auth.uid();
  -- 수정된 가수 목록에서 빠진 인증된 참가자는 관리자만 제거 가능
  IF TG_OP='UPDATE' AND actor_role NOT IN ('admin','super_admin') THEN
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
DROP TRIGGER IF EXISTS virhang_song_singers_sync ON public.virhang_published_tracks;
CREATE TRIGGER virhang_song_singers_sync AFTER INSERT OR UPDATE OF singer,created_by,id
ON public.virhang_published_tracks FOR EACH ROW EXECUTE FUNCTION public.virhang_sync_song_singers();
-- Existing rows backfill (no change to published track rows)
INSERT INTO public.virhang_artist_identities(artist_key,display_name)
SELECT DISTINCT lower(btrim(raw.value)),btrim(raw.value)
FROM public.virhang_published_tracks t CROSS JOIN LATERAL regexp_split_to_table(t.singer,'[,，、·]+') AS raw(value)
WHERE btrim(raw.value)<>'' ON CONFLICT(artist_key) DO NOTHING;
INSERT INTO public.virhang_song_singers(track_id,artist_key)
SELECT DISTINCT t.id,lower(btrim(raw.value))
FROM public.virhang_published_tracks t CROSS JOIN LATERAL regexp_split_to_table(t.singer,'[,，、·]+') AS raw(value)
WHERE btrim(raw.value)<>'' ON CONFLICT DO NOTHING;

-- 관리자만 실제 회원과 가수 활동명 연결/해제 가능. 나중에 계정을 만들어도 이 함수 한 번이면 과거 곡까지 연결.
CREATE OR REPLACE FUNCTION public.virhang_admin_link_artist(
  p_artist_name text, p_username text, p_action text DEFAULT 'link'
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE requester_role text; target_id uuid; target_role text; norm text;
BEGIN
 SELECT role INTO requester_role FROM public.virhang_users WHERE id=auth.uid();
 IF requester_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION '관리자만 가수 계정 연결을 할 수 있습니다.' USING ERRCODE='42501'; END IF;
 norm:=lower(btrim(p_artist_name));
 IF length(norm)<1 OR length(norm)>100 THEN RAISE EXCEPTION '가수 이름을 확인해 주세요.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.virhang_artist_identities WHERE artist_key=norm) THEN
   RAISE EXCEPTION '해당 이름으로 등록된 참여곡이 없습니다.';
 END IF;
 IF p_action='unlink' THEN
   UPDATE public.virhang_artist_identities SET verified_user_id=NULL,verified_by=NULL,verified_at=NULL WHERE artist_key=norm;
   RETURN '가수와 계정 연결을 해제했습니다.';
 ELSIF p_action<>'link' THEN RAISE EXCEPTION '지원하지 않는 작업입니다.'; END IF;
 IF p_username IS NULL OR p_username !~ '^[a-z0-9]{4,20}$' THEN RAISE EXCEPTION '올바른 버항 아이디를 입력해 주세요.'; END IF;
 SELECT id,role INTO target_id,target_role FROM public.virhang_users WHERE username=p_username;
 IF target_id IS NULL THEN RAISE EXCEPTION '아직 가입하지 않은 계정입니다. 회원 가입 후 연결해 주세요.'; END IF;
 IF target_role NOT IN ('streamer','admin','super_admin') THEN RAISE EXCEPTION '스트리머로 승인된 계정만 가수에 연결할 수 있습니다.'; END IF;
 IF EXISTS(SELECT 1 FROM public.virhang_artist_identities WHERE verified_user_id=target_id AND artist_key<>norm) THEN
   RAISE EXCEPTION '이 계정은 다른 가수와 이미 연결되어 있습니다. 운영진에게 확인하세요.';
 END IF;
 UPDATE public.virhang_artist_identities
 SET verified_user_id=target_id,verified_by=auth.uid(),verified_at=now() WHERE artist_key=norm;
 RETURN format('%s 가수와 %s 계정을 연결했습니다. 기존 참여곡에도 즉시 관리 권한이 생깁니다.', p_artist_name,p_username);
END; $$;
REVOKE ALL ON FUNCTION public.virhang_admin_link_artist(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_admin_link_artist(text,text,text) TO authenticated;

-- 서버에서 권한 판정 (브라우저 가수 이름만으로 권한을 얻을 수 없음)
CREATE OR REPLACE FUNCTION public.virhang_can_manage_published_track(p_track_id uuid,p_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.virhang_users me WHERE me.id=auth.uid()
  AND (me.role IN ('admin','super_admin') OR
      (me.role='streamer' AND (
        me.id=p_owner_id OR EXISTS(
         SELECT 1 FROM public.virhang_song_singers ss
         JOIN public.virhang_artist_identities ai ON ai.artist_key=ss.artist_key
         WHERE ss.track_id=p_track_id AND ai.verified_user_id=me.id
        )
      ))
  )
 );
$$;
REVOKE ALL ON FUNCTION public.virhang_can_manage_published_track(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_can_manage_published_track(uuid,uuid) TO authenticated;
DROP POLICY IF EXISTS virhang_public_tracks_read ON public.virhang_published_tracks;
CREATE POLICY virhang_public_tracks_read ON public.virhang_published_tracks FOR SELECT TO anon,authenticated USING (NOT is_deleted OR public.virhang_can_manage_published_track(id,created_by));
DROP POLICY IF EXISTS virhang_published_tracks_update ON public.virhang_published_tracks;
CREATE POLICY virhang_published_tracks_update ON public.virhang_published_tracks
 FOR UPDATE TO authenticated
 USING (public.virhang_can_manage_published_track(id,created_by))
 WITH CHECK (public.virhang_can_manage_published_track(id,created_by));
DROP POLICY IF EXISTS virhang_published_tracks_delete ON public.virhang_published_tracks;
CREATE POLICY virhang_published_tracks_delete ON public.virhang_published_tracks
 FOR DELETE TO authenticated USING (public.virhang_can_manage_published_track(id,created_by));
-- 로그인 유저가 자신의 관리 가능 곡 목록을 확인할 때만 쓰는 RPC
CREATE OR REPLACE FUNCTION public.virhang_my_manageable_track_ids()
RETURNS TABLE(track_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT t.id FROM public.virhang_published_tracks t
 WHERE public.virhang_can_manage_published_track(t.id,t.created_by);
$$;
REVOKE ALL ON FUNCTION public.virhang_my_manageable_track_ids() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.virhang_my_manageable_track_ids() TO authenticated;
COMMIT;
