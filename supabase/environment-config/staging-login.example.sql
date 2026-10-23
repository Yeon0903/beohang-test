-- NOT A MIGRATION. No effect unless a DB administrator explicitly approves and executes it.
-- Use only AFTER the project-ref release plan and human confirmation of the staging project.
-- Do not put this file in supabase/migrations or any production batch.
BEGIN;
DO $$ BEGIN
 IF current_setting('virhang.confirmed_staging_project',true) IS DISTINCT FROM 'hjvsbfphlnukmdkfbtsh' THEN
  RAISE EXCEPTION 'Set the staging project confirmation in this session after checking the dashboard project ref';
 END IF;
END $$;
UPDATE virhang_private.login_security
 SET environment='staging',developer_bypass=true WHERE singleton;
COMMIT;
-- The local confirmation GUC is a human mistake guard, not proof of project identity.
-- Ordinary staging viewers/streamers are exempt; admin/super_admin are always limited.
