-- 반장 추가점수(가점) 컬럼 추가
-- Supabase > SQL Editor에서 이 쿼리를 실행해주세요

ALTER TABLE evaluations 
ADD COLUMN IF NOT EXISTS midterm_bonus numeric DEFAULT 0;

ALTER TABLE evaluations 
ADD COLUMN IF NOT EXISTS final_bonus numeric DEFAULT 0;

-- 확인
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'evaluations' 
AND column_name IN ('midterm_bonus', 'final_bonus');
