-- ================================================================
-- 학생 레슨 종료 상태 관리용 컬럼 추가
-- Supabase SQL Editor에서 실행해 주세요.
-- ================================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS private_lesson_ended boolean DEFAULT false;