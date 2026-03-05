-- 프로필 정보 컬럼 추가 (학부, 학번, 학년, 전화번호, 전공)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department text,      -- 학부/학과
  ADD COLUMN IF NOT EXISTS student_id text,      -- 학번
  ADD COLUMN IF NOT EXISTS grade int,            -- 학년 (1~4)
  ADD COLUMN IF NOT EXISTS phone text,           -- 전화번호
  ADD COLUMN IF NOT EXISTS major text,           -- 전공
  ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false; -- 프로필 완료 여부
