-- ================================================================
-- 레코딩실습1 (23명) 학생 데이터 주입 스크립트
-- Supabase SQL Editor에서 실행하세요
-- !! 경고: 이 스크립트는 실제 auth.users 와 public.users 에 학생 데이터를 삽입합니다.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_course_id uuid;
  v_student record;
  v_user_id uuid;
  v_password_hash text;
BEGIN
  -- 레코딩실습1 과목 ID 조회
  SELECT id INTO v_course_id FROM public.courses WHERE name = '레코딩실습1' LIMIT 1;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION '레코딩실습1 과목을 찾을 수 없습니다.';
  END IF;

  -- 공통 비밀번호 해시 생성 ('password123' 등)
  -- 초기 테스트용 비밀번호 '1234'
  v_password_hash := crypt('1234', gen_salt('bf'));

  -- 학생 목록 임시 테이블 (23명)
  FOR v_student IN (
    SELECT * FROM (VALUES
      (1,  '2026413020', '고은서'),
      (2,  '2026413029', '김어진'),
      (3,  '2026413026', '김유민'),
      (4,  '2026413017', '김윤아'),
      (5,  '2026413016', '김은하수'),
      (6,  '2026413007', '박선영'),
      (7,  '2026413001', '박성건'),
      (8,  '2026410001', '박연수'),
      (9,  '2026413011', '박의인'),
      (10, '2026413009', '박제민'),
      (11, '2026413004', '박준현'),
      (12, '2026413019', '육상현'),
      (13, '2026413014', '윤가희'),
      (14, '2026413002', '윤바울'),
      (15, '2026413025', '윤은혜'),
      (16, '2026413035', '이규진'),
      (17, '2024113020', '이시은'),
      (18, '2026413008', '이우재'),
      (19, '2026413023', '이윤후'),
      (20, '2026412001', '정은영'),
      (21, '2026413018', '조윤빈'),
      (22, '2026413012', '주형선'),
      (23, '2026413021', '최지민')
    ) AS s(no, student_number, name)
  )
  LOOP
    -- 이미 생성된 학생인지 확인 (학번 email을 기준으로 판단)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_student.student_number || '@bu.ac.kr') THEN
      -- 새로운 UUID 발급
      v_user_id := gen_random_uuid();

      -- 1. auth.users 에 계정 생성
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, 
        email_confirmed_at, created_at, updated_at, 
        raw_user_meta_data
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', 
        v_student.student_number || '@bu.ac.kr', v_password_hash, 
        now(), now(), now(), 
        jsonb_build_object('full_name', v_student.name)
      );

      -- 2. public.users 에 프로필 정보 생성 (auth.users 트리거가 INSERT를 하므로 우리는 UPDATE)
      UPDATE public.users SET 
        course_id = v_course_id,
        department = '레코딩실습1 (백석대)',
        student_id = v_student.student_number,
        profile_completed = true
      WHERE id = v_user_id;

      -- 3. public.student_roster (관리자용 수강명단) 에 추가
      INSERT INTO public.student_roster (
        course_id, no, student_number, name, department, grade
      ) VALUES (
        v_course_id, v_student.no, v_student.student_number, v_student.name, '백석대', 3
      );
    END IF;
  END LOOP;
END $$;
