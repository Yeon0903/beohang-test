-- VirHang security patch 1. No data writes, role grants, or remote execution.
-- Prerequisites: reviewed virhang_users baseline, V2.6.8 and V3.0 joint-singer setup.
-- Apply only after user approval and staging verification. See docs/SECURITY_PATCH_01.md.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
 IF to_regprocedure('public.virhang_admin_streamer_account(text,text)') IS NULL
 OR to_regprocedure('public.virhang_admin_link_artist(text,text,text)') IS NULL
 OR to_regprocedure('public.virhang_sync_song_singers()') IS NULL THEN
  RAISE EXCEPTION 'Missing prerequisite functions; inspect schema before applying security patch';
 END IF;
END;
$$;

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
COMMIT;
