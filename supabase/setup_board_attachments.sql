-- ================================================================
-- Anonymous Q&A / 건의 Board Attachments Setup
-- ================================================================

-- Attachments table (for multi-file support on questions)
CREATE TABLE IF NOT EXISTS public.board_attachments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid REFERENCES public.board_questions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.board_attachments ENABLE ROW LEVEL SECURITY;

-- Students can read all attachments (since questions are readable by anyone authenticated)
DROP POLICY IF EXISTS "anyone_read_attachments" ON public.board_attachments;
CREATE POLICY "anyone_read_attachments" ON public.board_attachments
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Students can insert attachments for their own questions
DROP POLICY IF EXISTS "auth_insert_attachment" ON public.board_attachments;
CREATE POLICY "auth_insert_attachment" ON public.board_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_questions 
      WHERE id = question_id AND user_id = auth.uid()
    )
  );

-- Admins can manage (delete) attachments
DROP POLICY IF EXISTS "admin_manage_attachments" ON public.board_attachments;
CREATE POLICY "admin_manage_attachments" ON public.board_attachments
  FOR ALL USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
