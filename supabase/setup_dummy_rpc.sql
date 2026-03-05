-- 더미 데이터 (과제 + 상호평가 + 성적) 통합 RPC 함수
CREATE OR REPLACE FUNCTION public.manage_dummy_data(p_action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  i int;
  j int;
  dummy_uuid uuid;
  reviewer_uuid uuid;
  week int;
  num_assignments int;
  assignment_id_var uuid;
  peer_score int;
  -- 성적 관련 변수
  att_score numeric;
  absence int;
  mid_score numeric;
  f_score numeric;
  assign_score numeric;
  susi_score numeric;
  total numeric;
  grade text;
  peer_avg numeric;
BEGIN
  IF p_action = 'seed' THEN
    -- 기존 더미 데이터 삭제
    DELETE FROM public.peer_reviews
      WHERE reviewer_id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND reviewer_id <= '00000000-0000-0000-0000-000000000020'::uuid;
    DELETE FROM public.assignments
      WHERE user_id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND user_id <= '00000000-0000-0000-0000-000000000020'::uuid;
    DELETE FROM public.evaluations
      WHERE user_id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND user_id <= '00000000-0000-0000-0000-000000000020'::uuid;
    
    -- Step 1: 20명 유저 생성
    FOR i IN 1..20 LOOP
      dummy_uuid := ('00000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid;
      
      INSERT INTO auth.users (id, instance_id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
      VALUES (dummy_uuid, '00000000-0000-0000-0000-000000000000',
              'student' || LPAD(i::text, 2, '0') || '@test.com',
              'authenticated', 'authenticated', 'dummy_password', now(),
              '{"provider":"email","providers":["email"]}', '{}')
      ON CONFLICT (id) DO NOTHING;
      
      INSERT INTO public.users (id, email, role)
      VALUES (dummy_uuid, 'student' || LPAD(i::text, 2, '0') || '@test.com', 'user')
      ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- Step 2: 과제 생성 및 상호 평가 추가
    FOR i IN 1..20 LOOP
      dummy_uuid := ('00000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid;

      num_assignments := floor(random() * 3) + 1; -- 최소 1개는 제출
      FOR week IN 1..num_assignments LOOP
        -- 과제 삽입 후 ID 획득
        INSERT INTO public.assignments (user_id, week_number, file_url, file_id, content, status, score, is_anonymous)
        VALUES (
          dummy_uuid, week,
          'https://dummy-url.com/file-' || i::text || '-' || week::text || '.mp3',
          'dummy-file-id-' || i::text || '-' || week::text,
          week::text || '주차 과제 제출 - 학생 ' || i::text || '번',
          'submitted',
          floor(random() * 21) + 75,
          true
        )
        RETURNING id INTO assignment_id_var;

        -- 이 과제에 대해 3명이 상호 평가 (자기 자신 제외)
        FOR j IN 1..20 LOOP
          CONTINUE WHEN j = i; -- 자기 자신은 평가 불가
          CONTINUE WHEN random() > 0.2; -- 약 4명만 랜덤으로 평가 (20% 확률로 평가)
          
          reviewer_uuid := ('00000000-0000-0000-0000-' || LPAD(j::text, 12, '0'))::uuid;
          peer_score := floor(random() * 4) + 7; -- 7~10점

          INSERT INTO public.peer_reviews (assignment_id, reviewer_id, score, comment)
          VALUES (
            assignment_id_var,
            reviewer_uuid,
            peer_score,
            CASE floor(random() * 5)::int
              WHEN 0 THEN '음질이 깔끔하고 믹싱이 잘 되어 있습니다.'
              WHEN 1 THEN '레이어링이 잘 되어 있고 전체적으로 완성도가 높습니다.'
              WHEN 2 THEN '리듬감이 좋고 편곡이 창의적입니다.'
              WHEN 3 THEN '음원의 밸런스가 뛰어나고 마스터링이 인상적입니다.'
              ELSE '전체적으로 잘 만들어진 작품입니다. 공간감이 좋습니다.'
            END
          )
          ON CONFLICT (assignment_id, reviewer_id) DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;

    -- Step 3: 성적 데이터 생성 (peer_score_avg 반영)
    FOR i IN 1..20 LOOP
      dummy_uuid := ('00000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid;

      -- 해당 학생 과제들의 상호 평가 평균 (1~10점 스케일 → 100점 환산)
      SELECT COALESCE(AVG(peer_score_avg) * 10, 75)
        INTO peer_avg
        FROM public.assignments
        WHERE user_id = dummy_uuid AND peer_score_avg > 0;

      absence    := floor(random() * 3);
      att_score  := GREATEST(100 - (absence * 15), 55);
      mid_score  := floor(random() * 31) + 60;
      f_score    := floor(random() * 31) + 60;
      assign_score := LEAST(COALESCE(peer_avg, 75) + floor(random() * 11), 100);
      susi_score  := floor(random() * 21) + 70;

      total := ROUND((att_score * 0.20) + (mid_score * 0.25) + (f_score * 0.30) + (assign_score * 0.15) + (susi_score * 0.10), 2);

      IF absence >= 3 THEN
        grade := 'F';
      ELSIF absence = 2 THEN
        grade := CASE WHEN total >= 75 THEN 'C+' WHEN total >= 70 THEN 'C' ELSE 'D' END;
      ELSIF absence = 1 THEN
        grade := CASE WHEN total >= 85 THEN 'B+' WHEN total >= 80 THEN 'B' WHEN total >= 75 THEN 'C+' ELSE 'C' END;
      ELSE
        grade := CASE
          WHEN total >= 95 THEN 'A+'
          WHEN total >= 90 THEN 'A'
          WHEN total >= 85 THEN 'B+'
          WHEN total >= 80 THEN 'B'
          WHEN total >= 75 THEN 'C+'
          WHEN total >= 70 THEN 'C'
          WHEN total >= 60 THEN 'D'
          ELSE 'F'
        END;
      END IF;

      INSERT INTO public.evaluations (
        user_id, attendance_score, absence_count,
        midterm_score, final_score, assignment_score, susi_score,
        total_score, final_grade, updated_at
      )
      VALUES (
        dummy_uuid, att_score, absence,
        mid_score, f_score, assign_score, susi_score,
        total, grade, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        attendance_score = EXCLUDED.attendance_score,
        absence_count = EXCLUDED.absence_count,
        midterm_score = EXCLUDED.midterm_score,
        final_score = EXCLUDED.final_score,
        assignment_score = EXCLUDED.assignment_score,
        susi_score = EXCLUDED.susi_score,
        total_score = EXCLUDED.total_score,
        final_grade = EXCLUDED.final_grade,
        updated_at = now();

    END LOOP;

    RETURN '더미 데이터 20명 (과제 + 상호평가 + 성적) 생성 완료';
    
  ELSIF p_action = 'reset' THEN
    DELETE FROM public.peer_reviews
      WHERE reviewer_id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND reviewer_id <= '00000000-0000-0000-0000-000000000020'::uuid;
    DELETE FROM public.assignments
      WHERE user_id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND user_id <= '00000000-0000-0000-0000-000000000020'::uuid;
    DELETE FROM public.evaluations
      WHERE user_id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND user_id <= '00000000-0000-0000-0000-000000000020'::uuid;
    DELETE FROM public.users
      WHERE id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND id <= '00000000-0000-0000-0000-000000000020'::uuid;
    DELETE FROM auth.users
      WHERE id >= '00000000-0000-0000-0000-000000000001'::uuid
        AND id <= '00000000-0000-0000-0000-000000000020'::uuid;
    
    RETURN '더미 데이터 완전 초기화 완료';
  END IF;
  
  RETURN 'Invalid action';
END;
$$;
