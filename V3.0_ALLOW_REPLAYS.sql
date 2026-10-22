-- Run this ONLY if V3.0_RANKING_BACKEND_SETUP.sql was already executed.
-- Allow separate 30-second listening sessions to count even for the same song.
-- Does not remove Supabase login security or delete listening history.
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

