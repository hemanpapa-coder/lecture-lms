-- ================================================================
-- Homework submissions: soft-delete support
-- ================================================================
-- 학생이 본인 과제 제출(글/첨부)을 직접 삭제할 수 있도록 하되,
-- 실제 DB row는 보존하고 Google Drive 원본도 유지한다.
-- 어드민이 deleted_at을 NULL로 되돌리면 즉시 복구 가능.

-- 1) Add deleted_at columns (idempotent)
ALTER TABLE public.board_questions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.board_attachments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Useful partial indexes for "alive only" queries
CREATE INDEX IF NOT EXISTS board_questions_alive_idx
  ON public.board_questions (course_id, type, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS board_attachments_alive_idx
  ON public.board_attachments (question_id)
  WHERE deleted_at IS NULL;

-- 3) RLS: 학생 본인이 자기 question을 UPDATE (soft-delete 포함) 가능하도록 허용.
-- 기존 admin_manage_questions(FOR ALL)는 그대로 유지.
DROP POLICY IF EXISTS "student_update_own_question" ON public.board_questions;
CREATE POLICY "student_update_own_question" ON public.board_questions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) RLS: 학생 본인이 자기 question에 속한 attachment를 UPDATE (soft-delete 포함) 가능하도록 허용.
DROP POLICY IF EXISTS "student_update_own_attachment" ON public.board_attachments;
CREATE POLICY "student_update_own_attachment" ON public.board_attachments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.board_questions
      WHERE id = question_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.board_questions
      WHERE id = question_id AND user_id = auth.uid()
    )
  );
