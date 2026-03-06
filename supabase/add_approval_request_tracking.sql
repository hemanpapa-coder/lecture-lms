-- Add tracking columns for approval requests
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approval_request_count integer DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_requested_at timestamptz DEFAULT now();
