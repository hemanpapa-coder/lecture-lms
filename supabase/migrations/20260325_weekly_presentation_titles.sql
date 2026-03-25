ALTER TABLE courses ADD COLUMN IF NOT EXISTS weekly_presentation_titles JSONB DEFAULT '{}'::jsonb;
