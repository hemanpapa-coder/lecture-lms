-- 파일 캡션 컬럼 추가 (archives 테이블)
ALTER TABLE archives ADD COLUMN IF NOT EXISTS caption TEXT;
