-- ================================================================
-- Archive Tables Setup (archives + archive_pages)
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요
-- ================================================================

-- 1. archives 테이블 생성 (파일 업로드 목록)
CREATE TABLE IF NOT EXISTS public.archives (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  file_id text,
  file_url text,
  file_size bigint default 0,
  uploaded_by uuid references public.users(id) on delete set null,
  week_number integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read archives" ON public.archives;
DROP POLICY IF EXISTS "Admin can manage archives" ON public.archives;
CREATE POLICY "Anyone can read archives" ON public.archives FOR SELECT USING (true);
CREATE POLICY "Admin can manage archives" ON public.archives FOR ALL USING (public.get_my_role() = 'admin');

-- 2. archive_pages 테이블 생성 (15주차 위키 본문)
CREATE TABLE IF NOT EXISTS public.archive_pages (
  id uuid default gen_random_uuid() primary key,
  week_number integer not null unique,
  title text not null default '',
  content text not null default '',
  updated_at timestamp with time zone default now()
);

ALTER TABLE public.archive_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read pages" ON public.archive_pages;
DROP POLICY IF EXISTS "Admin can write pages" ON public.archive_pages;
CREATE POLICY "Anyone can read pages" ON public.archive_pages FOR SELECT USING (true);
CREATE POLICY "Admin can write pages" ON public.archive_pages FOR ALL USING (public.get_my_role() = 'admin');

-- 3. 1~15주차 기본 페이지 자동 생성
INSERT INTO public.archive_pages (week_number, title, content)
VALUES
  (1, '1주차 강의 자료', ''),
  (2, '2주차 강의 자료', ''),
  (3, '3주차 강의 자료', ''),
  (4, '4주차 강의 자료', ''),
  (5, '5주차 강의 자료', ''),
  (6, '6주차 강의 자료', ''),
  (7, '7주차 강의 자료', ''),
  (8, '8주차 강의 자료', ''),
  (9, '9주차 강의 자료', ''),
  (10, '10주차 강의 자료', ''),
  (11, '11주차 강의 자료', ''),
  (12, '12주차 강의 자료', ''),
  (13, '13주차 강의 자료', ''),
  (14, '14주차 강의 자료', ''),
  (15, '15주차 강의 자료', '')
ON CONFLICT (week_number) DO NOTHING;
