-- ================================================================
-- Anonymous Q&A / 건의 Board Setup
-- ================================================================

-- Questions table (user_id hidden from students via RLS)
CREATE TABLE IF NOT EXISTS public.board_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Replies table (can be private to questioner or public)
CREATE TABLE IF NOT EXISTS public.board_replies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid REFERENCES public.board_questions(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  is_private boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.board_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_replies ENABLE ROW LEVEL SECURITY;

-- Students can read all questions (anonymously - user_id not exposed by RLS, but column exists)
DROP POLICY IF EXISTS "anyone_read_questions" ON public.board_questions;
CREATE POLICY "anyone_read_questions" ON public.board_questions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Students can post questions
DROP POLICY IF EXISTS "auth_insert_question" ON public.board_questions;
CREATE POLICY "auth_insert_question" ON public.board_questions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can update (pin) and delete questions
DROP POLICY IF EXISTS "admin_manage_questions" ON public.board_questions;
CREATE POLICY "admin_manage_questions" ON public.board_questions
  FOR ALL USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Replies: public replies visible to all, private replies only to questioner and admin
DROP POLICY IF EXISTS "read_replies" ON public.board_replies;
CREATE POLICY "read_replies" ON public.board_replies
  FOR SELECT USING (
    is_private = false OR
    EXISTS (SELECT 1 FROM public.board_questions WHERE id = question_id AND user_id = auth.uid()) OR
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_reply" ON public.board_replies;
CREATE POLICY "admin_insert_reply" ON public.board_replies
  FOR INSERT WITH CHECK (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_reply" ON public.board_replies;
CREATE POLICY "admin_delete_reply" ON public.board_replies
  FOR DELETE USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admin_manage_replies" ON public.board_replies;
CREATE POLICY "admin_manage_replies" ON public.board_replies
  FOR UPDATE USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
