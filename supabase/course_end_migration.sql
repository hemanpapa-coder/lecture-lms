-- ============================================================
-- 종강 기능 (Course End-of-Semester) 마이그레이션
-- ============================================================

-- 1. 종강 여부 및 종강 시각
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_ended BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS ended_year INT;

-- 2. 종강 후 자료 제출 허용 여부 (기본: true — 아카이브에서도 제출 가능)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS late_submission_allowed BOOLEAN DEFAULT TRUE;
