-- ================================================================
-- 연구 자료 레포지터리 테이블 (오디오테크놀러지 과목용)
-- Supabase SQL Editor에서 실행하세요
-- ================================================================

CREATE TABLE IF NOT EXISTS public.research_uploads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  tags text[] DEFAULT '{}',        -- ['실험', '연구', '제작', '발표']
  file_url text,
  file_name text,
  file_size bigint DEFAULT 0,
  is_published boolean DEFAULT false,
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.research_uploads ENABLE ROW LEVEL SECURITY;

-- 학생: 자신의 업로드 읽기/쓰기 + 게시된 자료 읽기
DROP POLICY IF EXISTS "ru_own" ON public.research_uploads;
CREATE POLICY "ru_own" ON public.research_uploads
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ru_published" ON public.research_uploads;
CREATE POLICY "ru_published" ON public.research_uploads
  FOR SELECT USING (is_published = true);

-- 관리자: 전체 관리
DROP POLICY IF EXISTS "ru_admin" ON public.research_uploads;
CREATE POLICY "ru_admin" ON public.research_uploads
  FOR ALL USING (public.get_my_role() = 'admin');
