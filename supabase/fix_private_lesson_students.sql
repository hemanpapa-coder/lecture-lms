-- ================================================================
-- [긴급 수정] 개인레슨 학생들의 course_id 배정 해제 및 데이터 복구
-- ================================================================

-- 1. 잘못 배정된 레코딩실습1 과목(course_id) 해제
UPDATE public.users 
SET course_id = NULL 
WHERE name IN ('박성현', '양신옥', '나영윤', '문재모');

-- 2. 이전 스크린샷에서 확인된 원래의 private_lesson_id 복구
UPDATE public.users SET private_lesson_id = 'ccf6f5b1-4f96-4802-bbe4-09e58bef4793' WHERE email = 'nomage0526@gmail.com'; -- 박성현
UPDATE public.users SET private_lesson_id = 'fc63c52e-8c18-4e2e-a017-96a2f978286e' WHERE email = 'posisi353535@gmail.com'; -- 양신옥
UPDATE public.users SET private_lesson_id = '5ef35550-29b5-420d-a0ab-5d827e7d30c9' WHERE email = 'yellowpin123@gmail.com'; -- 나영윤
UPDATE public.users SET private_lesson_id = '1f8f8982-eafe-47cc-862d-eb679ea956ad' WHERE email = 'answoah123@bau.ac.kr'; -- 문재모

-- 3. 결과 확인
SELECT name, email, course_id, private_lesson_id 
FROM public.users 
WHERE name IN ('박성현', '양신옥', '나영윤', '문재모');
