import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// ── 타입 ──────────────────────────────────────────────
type TranscribeResult = {
  text: string
  provider: 'groq' | 'gemini'
}

// ── Groq Whisper 전사 ─────────────────────────────────
async function transcribeWithGroq(audioBlob: Blob, fileName: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const form = new FormData()
  form.append('file', audioBlob, fileName)
  form.append('model', 'whisper-large-v3')
  form.append('language', 'ko')
  form.append('response_format', 'text')

  // 60초 타임아웃 (동시 요청 시 무한 대기 방지)
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 60_000)
  let res: Response
  try {
    res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal,
    })
  } catch (e: any) {
    clearTimeout(tid)
    throw new Error(`GROQ_RATE_LIMITED:timeout:${e.message}`)
  }
  clearTimeout(tid)

  if (res.status === 429 || res.status === 503) {
    // 동시 요청 과부하 → 즉시 Gemini로 폴백 (대기 없음)
    const err = await res.text()
    throw new Error(`GROQ_RATE_LIMITED:${res.status}:${err}`)
  }
  if (!res.ok) {
    const err = await res.text()
    if (res.status === 402 || res.status === 413) {
      throw new Error(`GROQ_QUOTA_EXCEEDED:${res.status}:${err}`)
    }
    throw new Error(`Groq API error ${res.status}: ${err}`)
  }

  const text = await res.text()
  return text.trim()
}


// ── Gemini 오디오 전사 (단순 전사용) ─────────────────
async function transcribeWithGemini(audioBlob: Blob, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64Audio = Buffer.from(arrayBuffer).toString('base64')

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          {
            text: '이 강의 녹음 파일의 내용을 한국어로 정확하게 전사해 주세요. 말하는 내용을 빠짐없이 텍스트로 변환하되, 문단을 적절하게 구분하고, 핵심 개념이나 용어는 강조(**굵게**)하여 읽기 쉽게 정리해 주세요. 불분명한 부분은 [불분명]으로 표시하세요.',
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text) throw new Error('Gemini returned empty transcription')
  return text.trim()
}

// ── Gemini: 전사 텍스트 → 복습 노트 HTML 정리 ────────
async function summarizeToHtml(transcriptText: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const prompt = `아래는 강의 녹음의 전사 텍스트입니다. 이 내용을 학생들이 복습할 수 있도록 HTML 형식의 체계적인 강의 노트로 정리해 주세요.

출력 형식은 반드시 아래 HTML 구조를 따르세요. 마크다운이 아닌 순수 HTML로만 작성하세요.
\`\`\`html
<h1>📚 강의 요약</h1>
<p>이번 강의의 핵심을 2~3문장으로 요약합니다.</p>

<h2>🎯 핵심 개념</h2>
<ul>
  <li><strong>개념명</strong>: 설명...</li>
  <!-- 주요 용어/개념 목록 -->
</ul>

<h2>📖 강의 상세 내용</h2>
<h3>소주제 1</h3>
<p>상세 설명...</p>
<h3>소주제 2</h3>
<p>상세 설명...</p>

<h2>✅ 오늘의 핵심 정리</h2>
<ul>
  <li>핵심 포인트 1</li>
  <li>핵심 포인트 2</li>
</ul>
\`\`\`

규칙:
- 코드 블록 없이 HTML 태그만 출력하세요 (html 태그, head, body 태그는 쓰지 마세요)
- 전사 내용에 충실하되, 학생이 이해하기 쉽게 재구성하세요
- 불필요한 말버릇, 반복, [불분명] 표시는 제거하세요
- 한국어로 작성하세요

전사 텍스트:
${transcriptText}`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini summarize error ${res.status}: ${err}`)
  }

  const data = await res.json()
  let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!html) throw new Error('Gemini returned empty summary')

  // 코드 블록 마커 제거 (```html ... ```)
  html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim()
  return html
}

// ── MIME 타입 추론 ────────────────────────────────────
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
    wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm',
    flac: 'audio/flac', aac: 'audio/aac',
  }
  return map[ext] || 'audio/mpeg'
}

// ── POST: 오디오 업로드 & 전사/정리 ──────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (userRow?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const courseId = formData.get('courseId') as string
    const weekNumber = parseInt(formData.get('weekNumber') as string, 10)
    // mode: 'transcribe'(기존 저장용) | 'summarize'(아카이브 정리용 — DB 저장 안 함)
    const mode = (formData.get('mode') as string) || 'transcribe'

    if (!file || !courseId || isNaN(weekNumber)) {
      return NextResponse.json({ error: '파일, courseId, weekNumber가 필요합니다.' }, { status: 400 })
    }

    const fileName = file.name
    const mimeType = getMimeType(fileName)
    const fileSizeMB = file.size / (1024 * 1024)
    const audioBlob = new Blob([await file.arrayBuffer()], { type: mimeType })

    // ── STEP 1: 음성 → 텍스트 전사 ──
    let rawText: string
    let provider: 'groq' | 'gemini'

    if (fileSizeMB < 24.5) {
      try {
        rawText = await transcribeWithGroq(audioBlob, fileName)
        provider = 'groq'
      } catch (groqErr: any) {
        if (
          groqErr.message?.startsWith('GROQ_QUOTA_EXCEEDED') ||
          groqErr.message?.startsWith('GROQ_RATE_LIMITED') || // 동시 요청 과부하
          groqErr.message?.includes('413')
        ) {
          console.warn('[Transcribe] Groq unavailable, falling back to Gemini:', groqErr.message)
          rawText = await transcribeWithGemini(audioBlob, mimeType)
          provider = 'gemini'
        } else {
          throw groqErr
        }
      }
    } else {
      console.log('[Transcribe] File >25MB, using Gemini directly')
      rawText = await transcribeWithGemini(audioBlob, mimeType)
      provider = 'gemini'
    }

    // ── STEP 2: summarize 모드 — Gemini로 HTML 복습 노트 생성 ──
    if (mode === 'summarize') {
      const html = await summarizeToHtml(rawText)
      return NextResponse.json({ success: true, provider, html, rawText })
    }

    // ── transcribe 모드 — Supabase에 저장 ──
    await supabase.from('lecture_transcripts').upsert({
      course_id: courseId,
      week_number: weekNumber,
      audio_file_name: fileName,
      status: 'processing',
      ai_provider: '',
      transcript_text: '',
      error_message: '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'course_id,week_number' })

    const { error: dbErr } = await supabase.from('lecture_transcripts').upsert({
      course_id: courseId,
      week_number: weekNumber,
      audio_file_name: fileName,
      transcript_text: rawText,
      ai_provider: provider,
      status: 'done',
      error_message: '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'course_id,week_number' })

    if (dbErr) throw dbErr

    return NextResponse.json({ success: true, provider, text: rawText })
  } catch (err: any) {
    console.error('[Transcribe API Error]', err)
    return NextResponse.json({ error: err.message || '전사 실패' }, { status: 500 })
  }
}

// ── GET: 저장된 전사 결과 조회 ────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const courseId = searchParams.get('courseId')
    const weekNumber = parseInt(searchParams.get('weekNumber') || '0', 10)

    if (!courseId || !weekNumber) {
      return NextResponse.json({ error: 'courseId, weekNumber 필요' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lecture_transcripts')
      .select('*')
      .eq('course_id', courseId)
      .eq('week_number', weekNumber)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ transcript: data || null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH: 전사 텍스트 수동 수정 저장 ─────────────────
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (userRow?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const { courseId, weekNumber, transcriptText, isVisibleToStudents } = await req.json()

    const { error } = await supabase.from('lecture_transcripts').upsert({
      course_id: courseId,
      week_number: weekNumber,
      transcript_text: transcriptText,
      is_visible_to_students: isVisibleToStudents,
      status: 'done',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'course_id,week_number' })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
