-- ai_reports 테이블: AI가 생성한 학습 패턴 분석 리포트 저장
create table if not exists ai_reports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  report_type text not null, -- 'weekly' | 'daily' | 'student'
  period_label text,         -- '2026-W12', '2026-03-20' 등
  content text not null,     -- Gemini가 생성한 HTML 리포트
  stats jsonb,               -- 원시 통계 데이터
  created_at timestamptz default now()
);

create index if not exists idx_ai_reports_course_id on ai_reports(course_id);
create index if not exists idx_ai_reports_created_at on ai_reports(created_at desc);
