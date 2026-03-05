-- 프로필 정보 컬럼 추가 (수업 목표, 자기소개)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS class_goal text,      -- 수업을 통해 하고싶은 목표
  ADD COLUMN IF NOT EXISTS introduction text;    -- 간략한 자기소개
