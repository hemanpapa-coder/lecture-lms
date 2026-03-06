-- ================================================================
-- Course Chat, Announcements, and Polls Setup
-- ================================================================

-- 1. Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  type text DEFAULT 'message' CHECK (type IN ('message', 'notice', 'poll')),
  metadata jsonb DEFAULT '{}'::jsonb, -- Store poll options or extra info here
  created_at timestamptz DEFAULT now()
);

-- 2. Create polls table (to track current poll state if needed, though metadata can suffice)
-- For simplicity, let's use a dedicated table for votes to ensure unique voting per user.
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  option_index int NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id) -- One vote per user per poll
);

-- 3. Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- 4. Policies for chat_messages
-- Anyone in the course can read messages
DROP POLICY IF EXISTS "Users can view messages in their course" ON public.chat_messages;
CREATE POLICY "Users can view messages in their course" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND (users.course_id = chat_messages.course_id OR users.role = 'admin')
    )
  );

-- Users can insert messages in their course
DROP POLICY IF EXISTS "Users can send messages to their course" ON public.chat_messages;
CREATE POLICY "Users can send messages to their course" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND (users.course_id = chat_messages.course_id OR users.role = 'admin')
    )
  );

-- Only admins can delete messages (optional)
DROP POLICY IF EXISTS "Admins can delete messages" ON public.chat_messages;
CREATE POLICY "Admins can delete messages" ON public.chat_messages
  FOR DELETE USING (public.get_my_role() = 'admin');

-- 5. Policies for poll_votes
DROP POLICY IF EXISTS "Users can view poll votes in their course" ON public.poll_votes;
CREATE POLICY "Users can view poll votes in their course" ON public.poll_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      JOIN public.users u ON u.id = auth.uid()
      WHERE m.id = poll_votes.message_id
      AND (u.course_id = m.course_id OR u.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Users can vote in their course" ON public.poll_votes;
CREATE POLICY "Users can vote in their course" ON public.poll_votes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      JOIN public.users u ON u.id = auth.uid()
      WHERE m.id = poll_votes.message_id
      AND (u.course_id = m.course_id OR u.role = 'admin')
      AND u.id = auth.uid()
    )
  );

-- 6. Enable Realtime for these tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'poll_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
  END IF;
END $$;
