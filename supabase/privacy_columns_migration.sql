-- ============================================================
-- 개인정보보호 컬럼 마이그레이션
-- 개인정보보호법 준수를 위한 동의 기록 및 삭제 관리 컬럼 추가
-- ============================================================

-- 1. 개인정보 동의 시각 (법적 증거 보존)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS privacy_consented_at TIMESTAMPTZ;

-- 2. 종강일 (개인정보 보관 기간 기산일)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS semester_end_date DATE;

-- 3. 개인정보 삭제(익명화) 처리 시각
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS privacy_deleted_at TIMESTAMPTZ;

-- 4. 코스 전체에 종강일을 한 번에 설정하기 위한 컬럼 추가
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS semester_end_date DATE;

-- 코스 종강일을 기반으로 학생 보관 만료 날짜 뷰 (선택적)
-- 종강일 + 3년 = 개인정보 삭제 가능 날짜
-- CREATE OR REPLACE VIEW privacy_expiry AS
--   SELECT u.id, u.name, u.email, u.department, u.student_id,
--          u.privacy_consented_at,
--          c.semester_end_date,
--          (c.semester_end_date + INTERVAL '3 years') AS privacy_delete_eligible_at,
--          u.privacy_deleted_at
--   FROM users u
--   LEFT JOIN courses c ON c.id = u.course_id
--   WHERE u.role = 'user';

-- Grade notice per course (성적 산출 안내 수업별 독립 관리)
ALTER TABLE courses ADD COLUMN IF NOT EXISTS grade_notice TEXT;
