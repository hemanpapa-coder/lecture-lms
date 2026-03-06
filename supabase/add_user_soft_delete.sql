-- Add deleted_at column to users table for soft-delete
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
