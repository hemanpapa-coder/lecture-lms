-- ================================================================
-- [수정] course_id = NULL인 레코딩실습 학생 → 레코딩실습1에 연결
-- 학번 이메일(@bu.ac.kr)을 기준으로 레코딩실습1 과목에 배정
-- ================================================================

-- 1. 먼저 현황 확인 (실행 전 확인용)
SELECT u.name, u.email, u.course_id
FROM public.users u
WHERE u.role = 'user'
  AND u.course_id IS NULL
  AND u.email LIKE '%@bu.ac.kr';

-- 2. 수정: course_id=NULL인 @bu.ac.kr 학생들을 레코딩실습1에 배정
UPDATE public.users
SET course_id = (
  SELECT id FROM public.courses WHERE name = '레코딩실습1' LIMIT 1
)
WHERE role = 'user'
  AND course_id IS NULL
  AND email LIKE '%@bu.ac.kr';

-- 3. 수정 결과 확인
SELECT u.name, u.email, u.course_id, c.name AS course_name
FROM public.users u
JOIN public.courses c ON u.course_id = c.id
WHERE c.name = '레코딩실습1'
ORDER BY u.name;
