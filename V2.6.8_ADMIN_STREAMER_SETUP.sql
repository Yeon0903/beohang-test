-- Virhang V2.6.8: run in Supabase SQL Editor as project owner.
-- Existing accounts and songs are not deleted.
-- Only admin/super_admin may promote existing viewer accounts to streamer.
-- This does not link SOOP accounts or permit escalation to admin.
CREATE OR REPLACE FUNCTION public.virhang_admin_streamer_account(
  p_username text, p_action text
)
RETURNS TABLE(username text, display_name text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE caller_role text; target_id uuid; target_role text;
BEGIN
  SELECT v.role INTO caller_role FROM public.virhang_users v WHERE v.id = (SELECT auth.uid());
  IF caller_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.' USING ERRCODE='42501';
  END IF;
  IF p_username IS NULL OR p_username !~ '^[a-z0-9]{4,20}$' THEN
    RAISE EXCEPTION '올바른 아이디를 입력해 주세요.' USING ERRCODE='22023';
  END IF;
  IF p_action NOT IN ('lookup','grant','revoke') THEN
    RAISE EXCEPTION '허용되지 않은 요청입니다.' USING ERRCODE='22023';
  END IF;
  SELECT v.id,v.role INTO target_id,target_role
  FROM public.virhang_users v WHERE v.username=p_username FOR UPDATE;
  IF target_id IS NULL THEN
    RAISE EXCEPTION '가입된 버항 아이디가 없습니다.' USING ERRCODE='P0002';
  END IF;
  IF p_action='grant' THEN
    IF target_role NOT IN ('viewer','streamer') THEN
      RAISE EXCEPTION '관리자 계정의 권한을 변경할 수 없습니다.' USING ERRCODE='42501';
    END IF;
    UPDATE public.virhang_users v SET role='streamer', updated_at=now() WHERE v.id=target_id AND v.role='viewer';
  ELSIF p_action='revoke' THEN
    IF target_role <> 'streamer' THEN
      RAISE EXCEPTION '스트리머 계정만 일반 회원으로 변경할 수 있습니다.' USING ERRCODE='42501';
    END IF;
    UPDATE public.virhang_users v SET role='viewer', updated_at=now() WHERE v.id=target_id;
  END IF;
  RETURN QUERY SELECT v.username,v.display_name,v.role FROM public.virhang_users v WHERE v.id=target_id;
END;
$$;
REVOKE ALL ON FUNCTION public.virhang_admin_streamer_account(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.virhang_admin_streamer_account(text,text) TO authenticated;

-- Read ONLY own profile, using Auth identity, not client-supplied username.
CREATE OR REPLACE FUNCTION public.virhang_my_profile()
RETURNS TABLE(username text, display_name text, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT v.username, v.display_name, v.role
  FROM public.virhang_users v
  WHERE v.id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION public.virhang_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.virhang_my_profile() TO authenticated;
