-- Requires reviewed baseline, V2.6.9, V3 joint singers/rankings, and patch 01.
-- No remote execution. No existing track/history rows are rewritten or removed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regclass('public.virhang_rank_listens') IS NULL
 OR to_regprocedure('public.virhang_sync_song_singers()') IS NULL THEN
  RAISE EXCEPTION 'Review/apply prerequisite schema before patch 02';
 END IF;
END $$;

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

COMMIT;
