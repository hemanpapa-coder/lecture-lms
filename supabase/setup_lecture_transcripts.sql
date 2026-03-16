-- ================================================================
-- 강의 녹음 자동 전사 테이블
-- Supabase SQL Editor에서 실행하세요
-- ================================================================

CREATE TABLE IF NOT EXISTS public.lecture_transcripts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  week_number integer NOT NULL,
  audio_file_name text DEFAULT '',
  audio_file_url text DEFAULT '',       -- 오디오 파일 URL (Supabase Storage or external)
  transcript_text text DEFAULT '',      -- 전사 결과 텍스트
  ai_provider text DEFAULT '',          -- 'groq' | 'gemini'
  status text DEFAULT 'pending'         -- 'pending' | 'processing' | 'done' | 'error'
    CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message text DEFAULT '',
  is_visible_to_students boolean DEFAULT true,  -- 학생 공개 여부
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(course_id, week_number)
);

-- RLS 설정
ALTER TABLE public.lecture_transcripts ENABLE ROW LEVEL SECURITY;

-- 관리자: 전체 권한
DROP POLICY IF EXISTS "lt_admin" ON public.lecture_transcripts;
CREATE POLICY "lt_admin" ON public.lecture_transcripts
  FOR ALL USING (public.get_my_role() = 'admin');

-- 학생: 공개된 전사 결과만 읽기 가능
DROP POLICY IF EXISTS "lt_student_select" ON public.lecture_transcripts;
CREATE POLICY "lt_student_select" ON public.lecture_transcripts
  FOR SELECT USING (is_visible_to_students = true);
