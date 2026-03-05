-- ================================================================
-- 레코딩실습1 과목 전용 시스템 테이블
-- Supabase SQL Editor에서 실행하세요
-- ================================================================

-- 1. 출석체크 테이블
CREATE TABLE IF NOT EXISTS public.class_attendances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  week_number integer NOT NULL,
  status text NOT NULL CHECK (status IN ('출석', '지각', '결석', '병출석', '사유출석')),
  reason_text text DEFAULT '',
  proof_file_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, course_id, week_number)
);

ALTER TABLE public.class_attendances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ca_own" ON public.class_attendances;
CREATE POLICY "ca_own" ON public.class_attendances FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ca_admin" ON public.class_attendances;
CREATE POLICY "ca_admin" ON public.class_attendances FOR ALL USING (public.get_my_role() = 'admin');

-- 2. 제작 일지 (매주 작성)
CREATE TABLE IF NOT EXISTS public.production_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  week_number integer NOT NULL,
  last_week_done text DEFAULT '',
  this_week_plan text DEFAULT '',
  progress_percent integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, course_id, week_number)
);

ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pl_own_sel" ON public.production_logs;
CREATE POLICY "pl_own_sel" ON public.production_logs FOR SELECT USING (true); -- 모든 학생이 서로의 제작일지 열람 가능 (상호평가를 위해)
DROP POLICY IF EXISTS "pl_own_mod" ON public.production_logs;
CREATE POLICY "pl_own_mod" ON public.production_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "pl_own_upd" ON public.production_logs;
CREATE POLICY "pl_own_upd" ON public.production_logs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "pl_admin" ON public.production_logs;
CREATE POLICY "pl_admin" ON public.production_logs FOR ALL USING (public.get_my_role() = 'admin');

-- 3. 시험/기말 작품 제출
CREATE TABLE IF NOT EXISTS public.exam_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  exam_type text NOT NULL CHECK (exam_type IN ('중간고사', '기말작품', '수시과제PDF')),
  score integer DEFAULT 0,
  content text DEFAULT '', -- 각종 링크나 부가 설명
  file_url text DEFAULT '', -- 이미지, 비디오, 음원, PDF 파일 링크
  file_name text DEFAULT '',
  media_type text DEFAULT '', -- 'image', 'video', 'youtube', 'audio', 'pdf'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "es_all_sel" ON public.exam_submissions;
CREATE POLICY "es_all_sel" ON public.exam_submissions FOR SELECT USING (true); -- 상호평가를 위해 오픈
DROP POLICY IF EXISTS "es_own_mod" ON public.exam_submissions;
CREATE POLICY "es_own_mod" ON public.exam_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "es_own_upd" ON public.exam_submissions;
CREATE POLICY "es_own_upd" ON public.exam_submissions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "es_admin" ON public.exam_submissions;
CREATE POLICY "es_admin" ON public.exam_submissions FOR ALL USING (public.get_my_role() = 'admin');

-- 4. 출석 오픈 토글 (courses 테이블 추가)
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_attendance_open boolean DEFAULT false;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_evaluation_closed boolean DEFAULT false; -- 상호평가 저장(마감) 여부 스위치
