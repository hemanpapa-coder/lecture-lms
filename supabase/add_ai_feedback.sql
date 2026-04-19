-- Add ai_feedback column to assignments table
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS ai_feedback text;
