-- ================================================================
-- 투표(Poll) 기능을 위한 poll_votes 테이블
-- Supabase SQL Editor에서 실행하세요
-- ================================================================

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)  -- 한 유저가 같은 투표에 중복 투표 불가 (upsert 기준)
);

-- RLS 설정
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- 모든 로그인 유저가 투표 결과 열람 가능
DROP POLICY IF EXISTS "pv_select" ON public.poll_votes;
CREATE POLICY "pv_select" ON public.poll_votes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 본인 투표만 삽입/수정 가능
DROP POLICY IF EXISTS "pv_insert" ON public.poll_votes;
CREATE POLICY "pv_insert" ON public.poll_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pv_update" ON public.poll_votes;
CREATE POLICY "pv_update" ON public.poll_votes
  FOR UPDATE USING (auth.uid() = user_id);

-- 관리자 전체 권한
DROP POLICY IF EXISTS "pv_admin" ON public.poll_votes;
CREATE POLICY "pv_admin" ON public.poll_votes
  FOR ALL USING (public.get_my_role() = 'admin');
