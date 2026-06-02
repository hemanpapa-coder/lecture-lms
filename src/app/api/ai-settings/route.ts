import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// AI 설정 기본값
const OPENAI_TEXT_MODEL_DEFAULT = 'gpt-5.1'

function normalizeOpenAITextModel(model?: string): string {
  const normalized = (model || '').trim()
  if (!normalized || normalized === 'gpt-5.5') return OPENAI_TEXT_MODEL_DEFAULT
  return normalized
}

function normalizeAiSetting(setting: { provider: string; model: string; label?: string }, taskKey = ''): { provider: string; model: string; label: string } {
  return {
    ...setting,
    label: setting.label || '',
    model: setting.provider === 'openai' && taskKey !== 'image_gen' ? normalizeOpenAITextModel(setting.model) : setting.model,
  }
}

const AI_SETTING_DEFAULTS: Record<string, { provider: string; model: string; label: string }> = {
  transcription:       { provider: 'groq', model: 'whisper-large-v3',        label: '음성 → 텍스트 전사' },
  summarization:       { provider: 'router', model: 'auto',                  label: '강의 내용 정리' },
  assignment_feedback: { provider: 'router', model: 'auto',                  label: '과제 피드백 / 평가' },
  spell_check:         { provider: 'router', model: 'auto',                  label: '맞춤법 검사' },
  text:       { provider: 'router', model: 'auto',                           label: 'AI 채팅/평가/리포트' },
  vision:     { provider: 'gemini', model: 'gemini-1.5-flash',                          label: '이미지 인식 (OCR)' },
  transcribe: { provider: 'openai', model: 'whisper-1',                                  label: '음성 전사' },
  image_gen:  { provider: 'router', model: 'remote-visual', label: '이미지 생성' },
  tts:        { provider: 'router', model: 'remote-tts',                    label: 'TTS 음성 합성' },
}

// GET: AI 설정 + (courseId 있으면) 과목 컨텍스트
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const courseId = req.nextUrl.searchParams.get('courseId')

  // 과목별 컨텍스트만 요청하는 경우
  if (courseId) {
    const { data: row } = await supabase
      .from('settings')
      .select('value')
      .eq('key', `ai_course_context_${courseId}`)
      .single()
    return NextResponse.json({ courseContext: row?.value || '' })
  }

  // settings 테이블에서 ai_ 접두사 키 읽기
  const { data: rows, error } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'ai_%')

  if (error) {
    return NextResponse.json({ settings: AI_SETTING_DEFAULTS })
  }

  const settings = { ...AI_SETTING_DEFAULTS }
  for (const row of rows || []) {
    const taskKey = row.key.replace('ai_', '')
    // course_context_ 키는 settings 맵에서 제외
    if (taskKey.startsWith('course_context_')) continue
    try {
      settings[taskKey] = normalizeAiSetting(JSON.parse(row.value), taskKey)
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
  if (!taskKey || !provider) {
    return NextResponse.json({ error: 'taskKey, provider required' }, { status: 400 })
  }

  // course_context_ 접두사는 model 필드를 원문 텍스트로 저장
  const isCourseContext = taskKey.startsWith('course_context_')
  const value = isCourseContext
    ? (model || '')
    : JSON.stringify(normalizeAiSetting({ provider, model, label: AI_SETTING_DEFAULTS[taskKey]?.label || taskKey }, taskKey))

  const { error } = await supabase
    .from('settings')
    .upsert({ key: `ai_${taskKey}`, value, updated_at: new Date().toISOString() })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
