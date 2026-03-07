-- ================================================================
-- Bug / Error Report System
-- ================================================================

CREATE TABLE IF NOT EXISTS public.error_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  user_name text,          -- cached at submit time
  user_email text,         -- cached at submit time
  course_id uuid,
  page_url text,           -- window.location.href at time of report
  description text NOT NULL,
  screenshot_url text,     -- Supabase Storage URL
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_note text,         -- admin can add a note after fixing
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- Students can insert their own reports
DROP POLICY IF EXISTS "students_insert_error_report" ON public.error_reports;
CREATE POLICY "students_insert_error_report" ON public.error_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can read all reports
DROP POLICY IF EXISTS "admin_read_error_reports" ON public.error_reports;
CREATE POLICY "admin_read_error_reports" ON public.error_reports
  FOR SELECT USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update status/note
DROP POLICY IF EXISTS "admin_update_error_reports" ON public.error_reports;
CREATE POLICY "admin_update_error_reports" ON public.error_reports
  FOR UPDATE USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can delete reports
DROP POLICY IF EXISTS "admin_delete_error_reports" ON public.error_reports;
CREATE POLICY "admin_delete_error_reports" ON public.error_reports
  FOR DELETE USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ================================================================
-- Supabase Storage bucket for error screenshots
-- (Run this separately or create bucket in Supabase Dashboard)
-- ================================================================
-- insert into storage.buckets (id, name, public) values ('error-screenshots', 'error-screenshots', true)
-- on conflict do nothing;
