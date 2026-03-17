import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// AI 설정 기본값
export const AI_SETTING_DEFAULTS: Record<string, { provider: string; model: string; label: string }> = {
  transcription: {
    provider: 'groq',
    model: 'whisper-large-v3',
    label: '음성 → 텍스트 전사',
  },
  summarization: {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: '강의 내용 정리',
  },
  assignment_feedback: {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    label: '과제 피드백 / 평가',
  },
  spell_check: {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    label: '맞춤법 검사',
  },
}

// GET: 전체 AI 설정 읽기
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // settings 테이블에서 ai_ 접두사 키 읽기
  const { data: rows, error } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'ai_%')

  if (error) {
    // 테이블이 없으면 기본값 반환
    return NextResponse.json({ settings: AI_SETTING_DEFAULTS })
  }

  // DB 값 → 기본값에 덮어쓰기
  const settings = { ...AI_SETTING_DEFAULTS }
  for (const row of rows || []) {
    const taskKey = row.key.replace('ai_', '')
    try {
      settings[taskKey] = JSON.parse(row.value)
    } catch {}
  }

  return NextResponse.json({ settings })
}

// PUT: AI 설정 저장 (admin only)
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { taskKey, provider, model } = body
  if (!taskKey || !provider || !model) {
    return NextResponse.json({ error: 'taskKey, provider, model required' }, { status: 400 })
  }

  const value = JSON.stringify({ provider, model, label: AI_SETTING_DEFAULTS[taskKey]?.label || taskKey })

  // upsert
  const { error } = await supabase
    .from('settings')
    .upsert({ key: `ai_${taskKey}`, value, updated_at: new Date().toISOString() })

  if (error) {
    // 테이블이 없으면 생성 시도
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
