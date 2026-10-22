-- 버항 V2.6.9: 기존 virhang_tracks나 회원/플레이리스트는 건드리지 않습니다.
-- Supabase SQL Editor에서 관리자 권한으로 실행하세요.
CREATE TABLE IF NOT EXISTS public.virhang_published_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  singer text NOT NULL CHECK (char_length(btrim(singer)) BETWEEN 1 AND 50),
  album text NOT NULL DEFAULT '' CHECK (char_length(album) <= 80),
  platform text NOT NULL CHECK (platform IN ('youtube','soop')),
  source_url text NOT NULL CHECK (char_length(source_url) BETWEEN 12 AND 2000 AND source_url LIKE 'https://%'),
  artwork_url text NOT NULL DEFAULT '' CHECK (char_length(artwork_url) <= 2000),
  genre text NOT NULL CHECK (genre IN ('K-POP','J-POP','POP','보컬로이드')),
  details text[] NOT NULL DEFAULT '{}',
  song_type text NOT NULL CHECK (song_type IN ('커버곡','오리지널곡')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1200),
  lyrics text NOT NULL DEFAULT '',
  original_url text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS virhang_published_tracks_recent_idx ON public.virhang_published_tracks(created_at DESC);
ALTER TABLE public.virhang_published_tracks ENABLE ROW LEVEL SECURITY;

-- 현재 로그인한 Auth UUID 기준. 회원의 사용자 입력 role 메타데이터를 사용하지 않습니다.
CREATE OR REPLACE FUNCTION public.virhang_can_publish()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.virhang_users v
   WHERE v.id=(SELECT auth.uid()) AND v.role IN ('streamer','admin','super_admin')
 );
$$;
REVOKE ALL ON FUNCTION public.virhang_can_publish() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.virhang_can_publish() TO authenticated;

CREATE OR REPLACE FUNCTION public.virhang_can_manage_track(owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.virhang_users v
  WHERE v.id=(SELECT auth.uid())
    AND (v.role IN ('admin','super_admin') OR (v.role='streamer' AND v.id=owner_id))
 );
$$;
REVOKE ALL ON FUNCTION public.virhang_can_manage_track(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.virhang_can_manage_track(uuid) TO authenticated;

REVOKE ALL ON TABLE public.virhang_published_tracks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.virhang_published_tracks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.virhang_published_tracks TO authenticated;

DROP POLICY IF EXISTS virhang_public_tracks_read ON public.virhang_published_tracks;
CREATE POLICY virhang_public_tracks_read ON public.virhang_published_tracks
FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS virhang_published_tracks_insert ON public.virhang_published_tracks;
CREATE POLICY virhang_published_tracks_insert ON public.virhang_published_tracks
FOR INSERT TO authenticated WITH CHECK (
  created_by=(SELECT auth.uid()) AND (SELECT public.virhang_can_publish())
);
DROP POLICY IF EXISTS virhang_published_tracks_update ON public.virhang_published_tracks;
CREATE POLICY virhang_published_tracks_update ON public.virhang_published_tracks
FOR UPDATE TO authenticated
USING (public.virhang_can_manage_track(created_by))
WITH CHECK (public.virhang_can_manage_track(created_by));
DROP POLICY IF EXISTS virhang_published_tracks_delete ON public.virhang_published_tracks;
CREATE POLICY virhang_published_tracks_delete ON public.virhang_published_tracks
FOR DELETE TO authenticated USING (public.virhang_can_manage_track(created_by));

-- 주의: URL 플랫폼 검사와 악성 링크 방지를 서버에서 더 엄격히 해야 정식 공개할 수 있습니다.
-- 현재는 프런트엔드 허용 목록 + HTTPS 검사 수준의 개발 버전입니다.
