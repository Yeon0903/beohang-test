-- Restore previous 5 tries per username per 15 minutes.
CREATE OR REPLACE FUNCTION public.virhang_check_login_limit(p_username text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_attempts integer;
BEGIN
 IF p_username IS NULL OR p_username !~ '^[a-z0-9]{4,20}$' THEN RETURN false; END IF;
 INSERT INTO public.virhang_login_attempts AS t (username,attempt_count,window_started) VALUES (p_username,1,now())
 ON CONFLICT (username) DO UPDATE SET attempt_count=CASE WHEN t.window_started < now()-interval '15 minutes' THEN 1 ELSE t.attempt_count+1 END,
 window_started=CASE WHEN t.window_started < now()-interval '15 minutes' THEN now() ELSE t.window_started END
 RETURNING attempt_count INTO v_attempts;
 RETURN v_attempts<=5;
END; $$;
REVOKE ALL ON FUNCTION public.virhang_check_login_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_check_login_limit(text) TO service_role;
