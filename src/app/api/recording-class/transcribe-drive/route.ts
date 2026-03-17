import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

// ── Google Drive 공유 링크에서 파일 ID 추출 ──────────
function extractFileId(driveUrl: string): string | null {
  const m1 = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  const m2 = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2) return m2[1]
  const m3 = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (m3) return m3[1]
  return null
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

// ── Groq Whisper 전사 ─────────────────────────────────
async function transcribeWithGroq(audioBlob: Blob, fileName: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const form = new FormData()
  form.append('file', audioBlob, fileName)
  form.append('model', 'whisper-large-v3')
  form.append('language', 'ko')
  form.append('response_format', 'text')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq Whisper error ${res.status}: ${err}`)
  }
  return (await res.text()).trim()
}

// ── Groq LLaMA-3로 텍스트 → HTML 강의노트 정리 ───────
async function summarizeWithGroqLlama(rawText: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const systemPrompt = `당신은 대학 강의를 정리하는 전문 학습 도우미입니다.
주어진 강의 전사 텍스트를 학생들이 복습할 수 있는 체계적인 강의 노트로 정리하세요.
출력은 반드시 순수 HTML 태그만 사용하고 html/head/body 태그와 코드 블록(\`\`\`)은 포함하지 마세요.

출력 구조:
<h1>📚 강의 요약</h1>
<p>이번 강의의 핵심을 2~3문장으로 요약</p>
<h2>🎯 핵심 개념</h2>
<ul><li><strong>개념명</strong>: 설명</li></ul>
<h2>📖 강의 상세 내용</h2>
<h3>소주제</h3><p>상세 설명</p>
<h2>✅ 오늘의 핵심 정리</h2>
<ul><li>핵심 포인트</li></ul>

규칙:
- 반드시 한국어로 작성
- 말버릇, 반복 표현, 잡음은 제거하고 내용만 정리
- 전사 내용에 충실하게 재구성
- 전문 교재처럼 깔끔하게 정리`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `아래 강의 전사 텍스트를 강의 노트로 정리해주세요:\n\n${rawText}` },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq LLaMA error ${res.status}: ${err}`)
  }

  const data = await res.json()
  let html = data?.choices?.[0]?.message?.content || ''
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  return html
}

// ── POST: Google Drive fileId → AI 강의 정리 ─────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (userRow?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const { driveUrl, fileId: directFileId } = body

    let fileId: string | null = directFileId || null
    if (!fileId && driveUrl) fileId = extractFileId(driveUrl)
    if (!fileId) {
      return NextResponse.json({ error: '올바른 Google Drive 링크 또는 fileId가 필요합니다.' }, { status: 400 })
    }

    // Google Drive에서 파일 메타데이터 + 다운로드
    console.log('[Drive] Fetching file metadata for:', fileId)
    const drive = getDriveClient()
    const metaRes = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
    const fileName = metaRes.data.name || 'audio.mp3'
    const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
    const fileSizeMB = fileSizeBytes / (1024 * 1024)
    console.log(`[Drive] File: ${fileName}, Size: ${fileSizeMB.toFixed(1)}MB`)

    const dlRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    )
    const audioBuffer = Buffer.from(dlRes.data as ArrayBuffer)
    const mimeType = getMimeType(fileName)

    // ── 전사: 소용량은 단일 처리, 대용량은 24MB 청킹 ──
    let combinedText: string

    if (fileSizeMB < 24.5) {
      console.log('[Drive] Small file → single Groq Whisper transcription')
      const audioBlob = new Blob([audioBuffer], { type: mimeType })
      combinedText = await transcribeWithGroq(audioBlob, fileName)
    } else {
      console.log(`[Drive] Large file (${fileSizeMB.toFixed(1)}MB) → chunked transcription`)
      const CHUNK_SIZE = 24 * 1024 * 1024 // 24MB
      const chunks: Buffer[] = []
      for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
        chunks.push(audioBuffer.slice(i, i + CHUNK_SIZE))
      }
      console.log(`[Drive] Split into ${chunks.length} chunks`)

      const transcriptions: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        const chunkBlob = new Blob([chunks[i]], { type: mimeType })
        const chunkName = `chunk_${i + 1}_${fileName}`
        try {
          console.log(`[Drive] Transcribing chunk ${i + 1}/${chunks.length}...`)
          const text = await transcribeWithGroq(chunkBlob, chunkName)
          transcriptions.push(text)
        } catch (e: any) {
          console.warn(`[Drive] Chunk ${i + 1} failed:`, e.message)
        }
      }

      combinedText = transcriptions.join('\n\n')
      if (!combinedText.trim()) throw new Error('모든 청크 전사에 실패했습니다.')
    }

    console.log(`[Drive] Transcription complete (${combinedText.length} chars). Summarizing with Groq LLaMA...`)

    // ── 요약: Groq LLaMA-3로 HTML 강의노트 정리 ──
    const html = await summarizeWithGroqLlama(combinedText)

    return NextResponse.json({
      success: true,
      provider: 'groq',
      html,
      fileName,
      fileSizeMB: fileSizeMB.toFixed(1),
    })
  } catch (err: any) {
    console.error('[TranscribeDrive API Error]', err)
    return NextResponse.json({ error: err.message || '처리 실패' }, { status: 500 })
  }
}
