-- ================================================================
-- Setup Course Roles (사운드엔지니어 반장, 뮤지션 반장 등)
-- ================================================================

-- Add course_role column to public.users if it doesn't exist
-- Default role is 'student'. Other roles can be 'sound_engineer_rep', 'musician_rep'.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='public' AND table_name='users' AND column_name='course_role') THEN
        ALTER TABLE public.users ADD COLUMN course_role text DEFAULT 'student';
    END IF;
END $$;

-- Admins can update any user's profile
-- (Usually managed by the existing update policies, but ensuring admin has full access)
DROP POLICY IF EXISTS "Admin can update users" ON public.users;
CREATE POLICY "Admin can update users" ON public.users 
  FOR ALL USING (
    auth.email() = 'hemanpapa@gmail.com' OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
