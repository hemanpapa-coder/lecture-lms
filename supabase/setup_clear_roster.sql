-- 이 스크립트를 Supabase SQL Editor에서 실행하시면 
-- 현재 수강명단(student_roster)에 등록된 모든 학생 데이터가 깔끔하게 지워집니다.
-- (가입된 유저 계정은 삭제되지 않으며, 단순히 엑셀로 업로드된 명단만 비워집니다.)

DELETE FROM student_roster;
