-- Phase 8: 다중 과목 수강 지원을 위한 course_ids 컬럼 추가
-- users 테이블에 course_ids 배열 컬럼 추가 (기존 course_id 유지)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS course_ids UUID[] DEFAULT '{}';

-- 기존 course_id 값을 course_ids 배열로 마이그레이션
UPDATE public.users 
SET course_ids = ARRAY[course_id]
WHERE course_id IS NOT NULL AND (course_ids IS NULL OR course_ids = '{}');
