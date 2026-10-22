-- Virhang V3.0 alpha: authenticated YouTube listening events only.
-- Non-destructive; requires V2.6.9_PUBLISHED_TRACKS_SETUP.sql.
-- Run from Supabase SQL Editor. Backup before migration.
CREATE TABLE IF NOT EXISTS public.virhang_rank_listens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.virhang_published_tracks(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT finished_after_start CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX IF NOT EXISTS virhang_rank_listens_track_finished_idx ON public.virhang_rank_listens (track_id,finished_at DESC) WHERE finished_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS virhang_rank_listens_user_idx ON public.virhang_rank_listens (user_id,track_id,finished_at DESC);
ALTER TABLE public.virhang_rank_listens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.virhang_rank_listens FROM PUBLIC,anon,authenticated;

-- Start a prospective listening session. Client cannot insert/alter events directly.
CREATE OR REPLACE FUNCTION public.virhang_rank_start(p_track_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_event uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Login required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.virhang_published_tracks t WHERE t.id=p_track_id AND t.platform='youtube') THEN
   RAISE EXCEPTION 'Track not eligible'; END IF;
 -- Limit pending starts to reduce table spam.
 IF (SELECT count(*) FROM public.virhang_rank_listens x WHERE x.user_id=v_user AND x.started_at>now()-interval '1 minute')>=10 THEN
   RAISE EXCEPTION 'Too many play attempts'; END IF;
 -- Prune only stale, unfinished events for this member (preserve completed history).
 DELETE FROM public.virhang_rank_listens WHERE user_id=v_user AND finished_at IS NULL AND started_at < now()-interval '1 day';
 INSERT INTO public.virhang_rank_listens(user_id,track_id) VALUES(v_user,p_track_id) RETURNING id INTO v_event;
 RETURN v_event;
END; $$;

-- Server wall clock must advance >=30 seconds per playback. No per-account/track cooldown.
-- This is an abuse deterrent, NOT proof the external video actually played.
CREATE OR REPLACE FUNCTION public.virhang_rank_finish(p_event_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event public.virhang_rank_listens%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT * INTO v_event FROM public.virhang_rank_listens
 WHERE id=p_event_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR v_event.finished_at IS NOT NULL THEN RETURN false; END IF;
 IF v_event.started_at > now()-interval '30 seconds' OR v_event.started_at < now()-interval '3 hours' THEN RETURN false; END IF;
 UPDATE public.virhang_rank_listens SET finished_at=now() WHERE id=p_event_id AND finished_at IS NULL;
 RETURN true;
END; $$;

-- Aggregate by Asia/Seoul calendar boundaries, Top 50 or 100. Zero-faked demo values excluded.
CREATE OR REPLACE FUNCTION public.virhang_rank_get(p_mode text)
RETURNS TABLE(track_id uuid, score bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_start timestamptz; v_limit int:=50;
BEGIN
 IF p_mode NOT IN ('realtime','daily','weekly','monthly','yearly','alltime','new') THEN
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
 WHERE e.finished_at IS NOT NULL AND e.finished_at >= v_start
 AND (p_mode <> 'new' OR t.created_at>=now()-interval '30 days')
 GROUP BY e.track_id ORDER BY score DESC,e.track_id LIMIT v_limit;
END; $$;
REVOKE ALL ON FUNCTION public.virhang_rank_start(uuid),public.virhang_rank_finish(uuid),public.virhang_rank_get(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_rank_start(uuid),public.virhang_rank_finish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_rank_get(text) TO anon,authenticated;
