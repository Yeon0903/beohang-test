-- DEVELOPMENT ONLY. Edge Function currently public. Restore before production.
-- Keep existing table, and disable the custom limiter without deleting existing records.
CREATE OR REPLACE FUNCTION public.virhang_check_login_limit(p_username text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT true; $$;
REVOKE ALL ON FUNCTION public.virhang_check_login_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.virhang_check_login_limit(text) TO service_role;
