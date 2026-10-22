-- Virhang V2.6. BACK UP schema before executing. Never drop existing user rows.
-- Existing public.virhang_users(username) and unique index/check from earlier setup are retained.
-- This migration installs a trigger that links each *new* Supabase Auth user to their public profile.
-- Do not run the old V2.5_USERNAME_SETUP.sql; it targeted a different table.

CREATE OR REPLACE FUNCTION public.virhang_create_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE requested_username text;
BEGIN
  requested_username := NEW.raw_user_meta_data ->> 'username';
  -- Do not silently create an arbitrary username for legacy/email-only accounts.
  IF requested_username IS NULL THEN RETURN NEW; END IF;
  IF requested_username !~ '^[a-z0-9]{4,20}$' THEN
    RAISE EXCEPTION 'invalid username' USING ERRCODE = '22023';
  END IF;
  -- Role is set explicitly; client metadata is NOT trusted to choose privileges.
  INSERT INTO public.virhang_users(id, username, role)
  VALUES (NEW.id, requested_username, 'viewer');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.virhang_create_profile_on_signup() FROM PUBLIC, anon, authenticated;

-- Replace only this named trigger, leaving other auth triggers untouched.
DROP TRIGGER IF EXISTS virhang_v26_auth_signup_profile ON auth.users;
CREATE TRIGGER virhang_v26_auth_signup_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.virhang_create_profile_on_signup();

-- If a previous V2.5 usernames trigger was installed, it should be retired separately
-- after reviewing existing triggers; do NOT blindly delete old records.

-- Audit without revealing account information:
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'auth' AND event_object_table = 'users'
ORDER BY trigger_name;
