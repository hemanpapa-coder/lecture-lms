-- 1. Create a users table to manage roles and profiles
CREATE TABLE public.users (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Create policies
CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING (auth.uid() = id);

-- Fix infinite recursion by creating a security definer function for role checking
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- Allow admins to view all users using the function to bypass infinite RLS loop
CREATE POLICY "Admins can view all profiles" ON public.users FOR SELECT USING (
  public.get_my_role() = 'admin'
);

-- 4. Function to handle new user signup and insert them into public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger the function every time a user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Note: To make someone an admin, you currently need to manually update their role in the public.users table via Supabase SQL Editor:
UPDATE public.users SET role = 'admin' WHERE email = 'hemanpapa@gmail.com';
