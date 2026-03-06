-- 1. Add deleted_at columns for Soft Delete
ALTER TABLE public.archives ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.research_uploads ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Create content_history table for Document Versioning
CREATE TABLE IF NOT EXISTS public.content_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL, -- 'archive_page', 'assignment_content'
  entity_id uuid NOT NULL,
  content text NOT NULL,
  version_label text,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

-- RLS for content_history
ALTER TABLE public.content_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ch_own" ON public.content_history FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "ch_admin" ON public.content_history FOR ALL USING (public.get_my_role() = 'admin');

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_content_history_entity ON public.content_history(entity_type, entity_id);

-- Update RLS for soft delete: Only select items where deleted_at IS NULL (optional, or handle in query)
-- For now, we will handle it in the application queries for flexibility.
