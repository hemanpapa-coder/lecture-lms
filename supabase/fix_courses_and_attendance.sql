-- ================================================================
-- [최종 해결] 과목 시스템 및 관련 설정 복구
-- Supabase SQL Editor에서 실행해 주세요.
-- ================================================================

-- 1. courses 테이블 생성 (이미 있으면 무시)
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text default '',
  created_at timestamptz default now()
);

-- 2. 필요한 과목 삽입
INSERT INTO public.courses (name, description) VALUES
  ('레코딩실습1', '실습 위주의 레코딩 강의 1'),
  ('홈레코딩과 음향학A', '홈레코딩 기초와 음향학 이론 A반'),
  ('홈레코딩과 음향학B', '홈레코딩 기초와 음향학 이론 B반'),
  ('오디오테크놀러지', '오디오 기술 및 응용')
ON CONFLICT (name) DO NOTHING;

-- 3. courses 테이블에 출석 관련 컬럼 추가
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_attendance_open boolean DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_evaluation_closed boolean DEFAULT false;

-- 4. users 테이블에서 courses 테이블로의 연결(FK) 생성
-- (이미 컬럼 추가를 했다면 제약조건만 설정되거나 무시됩니다)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_course_id_fkey'
    ) THEN
        ALTER TABLE public.users 
        ADD CONSTRAINT users_course_id_fkey 
        FOREIGN KEY (course_id) REFERENCES public.courses(id);
    END IF;
END $$;
