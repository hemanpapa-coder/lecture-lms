-- ==========================================================
-- Phase 3: 평가 및 상호 평가 데이터베이스 스키마
-- ==========================================================

-- 1. `assignments` (과제물 테이블: Phase 2 보완 및 Phase 3 연동)
CREATE TABLE public.assignments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  week_name text not null, -- 예: '1주차', '2주차'
  file_name text not null, 
  drive_view_link text, -- 구글 드라이브 뷰어 링크 (오디오 재생용)
  drive_dl_link text,   -- 무료 다운로드 링크
  is_anonymous boolean default true, -- 상호 평가 시 익명화 여부
  peer_score_avg numeric(5,2) default 0, -- 상호 평가 평균 점수 캐싱
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  UNIQUE(user_id, week_name) -- 한 유저당 주차별 1개 과제 제한 (필요시 제거)
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own assignments" ON public.assignments FOR SELECT USING (auth.uid() = user_id);
-- Admin or anonymous peer review viewing might need more complex policies or function wrappers.
CREATE POLICY "Admins can view all assignments" ON public.assignments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
-- Allow viewing anonymous assignments for peer review
CREATE POLICY "Users can view anonymous assignments" ON public.assignments FOR SELECT USING (is_anonymous = true);
CREATE POLICY "Users can insert their own assignments" ON public.assignments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own assignments" ON public.assignments FOR UPDATE USING (auth.uid() = user_id);


-- 2. `peer_reviews` (상호 평가 테이블)
CREATE TABLE public.peer_reviews (
  id uuid default gen_random_uuid() primary key,
  assignment_id uuid references public.assignments(id) on delete cascade not null,
  reviewer_id uuid references public.users(id) on delete cascade not null,
  score integer check (score >= 1 and score <= 10) not null, -- 1~10점 척도
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  UNIQUE(assignment_id, reviewer_id) -- 한 과제당 한 사람당 1번만 평가 가능
);

ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view reviews they wrote" ON public.peer_reviews FOR SELECT USING (auth.uid() = reviewer_id);
CREATE POLICY "Admins can view all reviews" ON public.peer_reviews FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can create reviews" ON public.peer_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);


-- 3. `evaluations` (성적 자동화 연산을 위한 마스터 테이블)
CREATE TABLE public.evaluations (
  user_id uuid references public.users(id) on delete cascade not null primary key,
  attendance_score numeric(5,2) default 100, -- 기본 출석 점수
  absence_count integer default 0,           -- 결석 횟수 (1회 MAX B+, 2회 MAX C+, 3회 F)
  midterm_score numeric(5,2) default 0,      -- 중간 점수
  final_score numeric(5,2) default 0,        -- 기말 점수
  assignment_score numeric(5,2) default 0,   -- 과제 총점 (peer_score_avg 등 합산)
  susi_score numeric(5,2) default 0,         -- 수시 점수
  qa_penalty_count integer default 0,        -- 질문 미제출 누적 횟수
  has_final_project boolean default false,   -- 기말 최종 음원 링크 제출 여부 (False시 A 불가)
  total_score numeric(5,2) default 0,        -- 계산된 총점
  final_grade text,                          -- 최종 학점 (A+, A, B+ ...)
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own evaluation" ON public.evaluations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view and edit all evaluations" ON public.evaluations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);


-- ==========================================================
-- Trigger: 상호 평가 시 과제 테이블의 평균 점수 자동 업데이트
-- ==========================================================
CREATE OR REPLACE FUNCTION update_peer_score_avg()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.assignments
    SET peer_score_avg = (
      SELECT COALESCE(AVG(score), 0) FROM public.peer_reviews WHERE assignment_id = NEW.assignment_id
    )
    WHERE id = NEW.assignment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.assignments
    SET peer_score_avg = (
      SELECT COALESCE(AVG(score), 0) FROM public.peer_reviews WHERE assignment_id = OLD.assignment_id
    )
    WHERE id = OLD.assignment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_peer_review_changed
AFTER INSERT OR UPDATE OR DELETE ON public.peer_reviews
FOR EACH ROW EXECUTE FUNCTION update_peer_score_avg();
