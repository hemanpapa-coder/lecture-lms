-- AI 설정 저장을 위한 settings 테이블
-- Supabase SQL 에디터에서 실행하세요

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 관리자만 읽기/쓰기 가능
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to settings" ON settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- 기본 AI 설정값 삽입
INSERT INTO settings (key, value) VALUES
  ('ai_transcription', '{"provider":"groq","model":"whisper-large-v3","label":"음성 → 텍스트 전사"}'),
  ('ai_summarization', '{"provider":"gemini","model":"gemini-2.5-pro","label":"강의 내용 정리"}'),
  ('ai_assignment_feedback', '{"provider":"gemini","model":"gemini-2.5-pro","label":"과제 피드백 / 평가"}'),
  ('ai_spell_check', '{"provider":"groq","model":"llama-3.1-8b-instant","label":"맞춤법 검사"}')
ON CONFLICT (key) DO NOTHING;
