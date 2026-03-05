-- This script fixes the infinite recursion error in the "users" table RLS policies.

-- 1. Drop the problematic policy that causes the infinite loop
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.users;

-- 2. Create a SECURITY DEFINER function to bypass RLS when checking a user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 3. Re-create the policy using the safe function
CREATE POLICY "Admins can view all profiles" ON public.users 
  FOR SELECT 
  USING ( public.get_my_role() = 'admin' );
