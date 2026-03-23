-- courses 테이블에 metadata JSONB 컬럼 추가
-- homework_deadlines 등 설정값 저장에 사용
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
