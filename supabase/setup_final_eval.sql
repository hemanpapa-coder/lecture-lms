-- ==========================================================
-- Phase 3-B: 기말 최종 상호 평가 전용 테이블 (별점 시스템)
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.final_peer_reviews (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  reviewer_id uuid references public.users(id) on delete cascade not null,
  reviewee_id uuid references public.users(id) on delete cascade not null,
  score integer check (score >= 1 and score <= 5) not null, -- 1~5점 척도
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  UNIQUE(course_id, reviewer_id, reviewee_id) -- 한 과목에서 같은 사람에게 2번 평가 불가
);

ALTER TABLE public.final_peer_reviews ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신이 작성한 평가를 볼 수 있음
CREATE POLICY "Users can view reviews they wrote" 
ON public.final_peer_reviews FOR SELECT 
USING (auth.uid() = reviewer_id);

-- 관리자는 모든 평가를 볼 수 있음 (수정 및 삭제 권한 포함 시 ALL)
CREATE POLICY "Admins can view all reviews" 
ON public.final_peer_reviews FOR ALL 
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 사용자는 평가를 작성할 수 있음
CREATE POLICY "Users can create reviews" 
ON public.final_peer_reviews FOR INSERT 
WITH CHECK (auth.uid() = reviewer_id);

-- 사용자는 자신이 작성한 평가를 수정할 수 있음
CREATE POLICY "Users can update their reviews" 
ON public.final_peer_reviews FOR UPDATE 
USING (auth.uid() = reviewer_id);
