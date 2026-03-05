-- ================================================================
-- [최종 통합] 필요한 모든 테이블과 정책 설정 (안전한 버전)
-- 이 스크립트 하나를 실행하면 모든 설정이 완료됩니다.
-- ================================================================

-- Step 1: 기존 테이블이 있다면 삭제 후 재생성 (완전 초기화)
-- 주의: 기존 데이터가 삭제됩니다!
DROP TABLE IF EXISTS public.peer_reviews CASCADE;
DROP TABLE IF EXISTS public.assignments CASCADE;
DROP TABLE IF EXISTS public.evaluations CASCADE;

-- Step 2: assignments 테이블 생성 (RLS 없이)
CREATE TABLE public.assignments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  week_name text,
  week_number integer,
  file_name text,
  file_url text,
  file_id text,
  content text,
  status text default 'submitted',
  score numeric(5,2) default 0,
  drive_view_link text,
  drive_dl_link text,
  is_anonymous boolean default true,
  peer_score_avg numeric(5,2) default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Step 3: peer_reviews 테이블 생성
CREATE TABLE public.peer_reviews (
  id uuid default gen_random_uuid() primary key,
  assignment_id uuid references public.assignments(id) on delete cascade not null,
  reviewer_id uuid references public.users(id) on delete cascade not null,
  score integer check (score >= 1 and score <= 10) not null,
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  UNIQUE(assignment_id, reviewer_id)
);

-- Step 4: evaluations 테이블 생성
CREATE TABLE public.evaluations (
  user_id uuid references public.users(id) on delete cascade not null primary key,
  attendance_score numeric(5,2) default 100,
  absence_count integer default 0,
  midterm_score numeric(5,2) default 0,
  final_score numeric(5,2) default 0,
  assignment_score numeric(5,2) default 0,
  susi_score numeric(5,2) default 0,
  qa_penalty_count integer default 0,
  has_final_project boolean default false,
  total_score numeric(5,2) default 0,
  final_grade text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Step 5: RLS 활성화
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Step 6: assignments RLS 정책 (get_my_role 함수로 재귀 방지)
CREATE POLICY "a_own" ON public.assignments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "a_admin" ON public.assignments FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "a_anon" ON public.assignments FOR SELECT USING (is_anonymous = true);
CREATE POLICY "a_insert" ON public.assignments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "a_update" ON public.assignments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "a_delete" ON public.assignments FOR DELETE USING (auth.uid() = user_id);
-- SECURITY DEFINER 함수(RPC)에서의 접근 허용
CREATE POLICY "a_service" ON public.assignments FOR ALL TO postgres USING (true) WITH CHECK (true);

-- Step 7: peer_reviews RLS 정책
CREATE POLICY "pr_own" ON public.peer_reviews FOR SELECT USING (auth.uid() = reviewer_id);
CREATE POLICY "pr_admin" ON public.peer_reviews FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "pr_insert" ON public.peer_reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- Step 8: evaluations RLS 정책
CREATE POLICY "ev_own" ON public.evaluations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ev_admin" ON public.evaluations FOR ALL USING (public.get_my_role() = 'admin');

-- Step 9: users 테이블에 profile_image_url 컬럼 추가
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_image_url text;

-- Step 10: 상호 평가 평균 점수 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_peer_score_avg()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.assignments SET peer_score_avg = (
      SELECT COALESCE(AVG(score), 0) FROM public.peer_reviews WHERE assignment_id = OLD.assignment_id
    ) WHERE id = OLD.assignment_id;
  ELSE
    UPDATE public.assignments SET peer_score_avg = (
      SELECT COALESCE(AVG(score), 0) FROM public.peer_reviews WHERE assignment_id = NEW.assignment_id
    ) WHERE id = NEW.assignment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_peer_review_changed ON public.peer_reviews;
CREATE TRIGGER on_peer_review_changed
AFTER INSERT OR UPDATE OR DELETE ON public.peer_reviews
FOR EACH ROW EXECUTE FUNCTION update_peer_score_avg();
