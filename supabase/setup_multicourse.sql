-- ================================================================
-- Multi-Course LMS Setup
-- Supabase SQL Editor에서 실행하세요
-- ================================================================

-- 1. courses 테이블 생성
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text default '',
  created_at timestamptz default now()
);

-- 4개 과목 삽입
INSERT INTO public.courses (name, description) VALUES
  ('홈레코딩과 음향학A', '홈레코딩 기초와 음향학 이론 A반'),
  ('홈레코딩과 음향학B', '홈레코딩 기초와 음향학 이론 B반'),
  ('레코딩실습', '실습 위주의 레코딩 강의'),
  ('오디오테크놀러지', '오디오 기술 및 응용')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read courses" ON public.courses;
CREATE POLICY "Anyone can read courses" ON public.courses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin can manage courses" ON public.courses;
CREATE POLICY "Admin can manage courses" ON public.courses FOR ALL USING (public.get_my_role() = 'admin');

-- 2. users 테이블에 course_id 추가
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS course_id uuid references public.courses(id);

-- 3. assignments 테이블에 course_id 추가
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS course_id uuid references public.courses(id);

-- 4. archive_pages 테이블에 course_id 추가
ALTER TABLE public.archive_pages ADD COLUMN IF NOT EXISTS course_id uuid references public.courses(id);

-- 5. archives 테이블에 course_id 추가
ALTER TABLE public.archives ADD COLUMN IF NOT EXISTS course_id uuid references public.courses(id);

-- 6. evaluations 테이블에 course_id 추가
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS course_id uuid references public.courses(id);

-- 7. peer_reviews 테이블에 course_id 추가 (reviewer 통해 조인 가능하지만 편의상 추가)
ALTER TABLE public.peer_reviews ADD COLUMN IF NOT EXISTS course_id uuid references public.courses(id);

-- 8. 과목별 × 15주차 archive_pages 생성 (기존 week_number unique 제약 제거 후 재생성)
ALTER TABLE public.archive_pages DROP CONSTRAINT IF EXISTS archive_pages_week_number_key;

-- course_id + week_number 유니크 제약 추가
ALTER TABLE public.archive_pages 
  ADD CONSTRAINT archive_pages_course_week_unique UNIQUE (course_id, week_number);

-- 각 과목별 15주차 페이지 삽입
INSERT INTO public.archive_pages (week_number, title, content, course_id)
SELECT 
  w,
  c.name || ' ' || w || '주차 강의 자료',
  '',
  c.id
FROM generate_series(1, 15) AS w
CROSS JOIN public.courses c
ON CONFLICT (course_id, week_number) DO NOTHING;
