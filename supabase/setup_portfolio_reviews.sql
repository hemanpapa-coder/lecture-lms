-- 1. portfolio_reviews 테이블 생성
CREATE TABLE IF NOT EXISTS public.portfolio_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  reviewee_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  score_completeness integer CHECK (score_completeness >= 1 AND score_completeness <= 5) NOT NULL, -- 곡의 완성도 별점 (1~5)
  score_quality integer CHECK (score_quality >= 1 AND score_quality <= 5) NOT NULL, -- 레코딩/믹싱 품질 별점 (1~5)
  comment text NOT NULL CHECK (char_length(trim(comment)) >= 10), -- 최소 10자 이상의 감상평
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(reviewer_id, reviewee_id, course_id) -- 한 과목에서 특정 학생에게 1번만 평가 가능
);

-- RLS 활성화
ALTER TABLE public.portfolio_reviews ENABLE ROW LEVEL SECURITY;

-- 조회 정책: 누구나 리뷰를 볼 수 있음 (또는 학급 멤버만)
DROP POLICY IF EXISTS "pr_all_sel" ON public.portfolio_reviews;
CREATE POLICY "pr_all_sel" ON public.portfolio_reviews FOR SELECT USING (true);

-- 삽입 정책: 본인이 작성자로 지정된 리뷰만 삽입 가능, 단 자기 자신은 평가 불가
DROP POLICY IF EXISTS "pr_own_ins" ON public.portfolio_reviews;
CREATE POLICY "pr_own_ins" ON public.portfolio_reviews FOR INSERT WITH CHECK (
  auth.uid() = reviewer_id AND reviewer_id != reviewee_id
);

-- 수정 정책: 자신이 작성한 리뷰만 수정 가능
DROP POLICY IF EXISTS "pr_own_upd" ON public.portfolio_reviews;
CREATE POLICY "pr_own_upd" ON public.portfolio_reviews FOR UPDATE USING (auth.uid() = reviewer_id);

-- 2. Trigger: 포트폴리오 평가 시 evaluations 테이블의 final_score(또는 별도 상호평가 점수) 자동 업데이트
-- 여기서는 두 별점의 평균(최대 5점) × 2를 하여 10점 만점 척도로 환산 후 evaluations.assignment_score나 final_score에 반영하도록 설계할 수 있습니다.
-- 기말고사 점수(final_score)에 반영 (비중 30%를 감안, 환산 로직은 추후 필요시 수정)
CREATE OR REPLACE FUNCTION update_portfolio_score_avg()
RETURNS TRIGGER AS $$
DECLARE
  avg_completeness numeric;
  avg_quality numeric;
  total_avg_10_scale numeric;
BEGIN
  -- 대상 학생이 받은 모든 리뷰의 평균 계산
  SELECT 
    COALESCE(AVG(score_completeness), 0),
    COALESCE(AVG(score_quality), 0)
  INTO avg_completeness, avg_quality
  FROM public.portfolio_reviews
  WHERE reviewee_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id) 
    AND course_id = COALESCE(NEW.course_id, OLD.course_id);

  -- 두 항목의 평균을 더해 10점 만점으로 변환 (5점 + 5점 = 10점 만점)
  total_avg_10_scale := avg_completeness + avg_quality;

  -- evaluations 테이블의 assignment_score(또는 원하는 필드) 업데이트
  -- 기존 로직을 덮어씌울지 합산할지에 따라 다름. 여기서는 상호평가 전용 필드가 있다면 좋지만, 
  -- 임시로 final_score(30점 만점 환산: 10점 척도 * 3) 에 반영한다고 가정 예시
  UPDATE public.evaluations
  SET final_score = total_avg_10_scale * 3 -- 10점 만점 기준을 30점 만점 가중치로 환산
  WHERE user_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 부착
DROP TRIGGER IF EXISTS on_portfolio_review_changed ON public.portfolio_reviews;
CREATE TRIGGER on_portfolio_review_changed
AFTER INSERT OR UPDATE OR DELETE ON public.portfolio_reviews
FOR EACH ROW EXECUTE FUNCTION update_portfolio_score_avg();
