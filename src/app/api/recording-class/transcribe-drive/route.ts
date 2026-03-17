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
type AiMode = 'detailed' | 'summary' | 'transcript'

async function summarizeWithGroqLlama(rawText: string, mode: AiMode = 'detailed'): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const prompts: Record<AiMode, string> = {
    detailed: `당신은 대학 강의를 정리하는 전문 학습 도우미입니다.
주어진 강의 전사 텍스트를 학생들이 교재처럼 활용할 수 있는 상세한 강의 노트로 정리하세요.

핵심 원칙:
- 강의에서 언급된 내용을 최대한 보존하세요. 버리는 내용이 10% 이하가 되도록 하세요.
- 교수님이 설명한 모든 개념, 예시, 스토리, 세부 내용을 포함하세요.
- 말버릇("어", "음", 반복 표현)만 제거하고 내용은 모두 유지하세요.
- 교재의 챕터처럼 논리적인 흐름으로 재구성하세요.
- 출력은 순수 HTML 태그만 사용하고 html/head/body 태그와 코드 블록은 포함하지 마세요.

출력 구조:
<h1>📚 [강의 제목 추론]</h1>
<p><strong>강의 개요:</strong> 이번 강의의 핵심을 2~3문장으로</p>
<h2>🎯 핵심 개념</h2>
<ul><li><strong>개념명</strong>: 상세 설명 (교수님의 설명 그대로)</li></ul>
<h2>📖 강의 내용</h2>
<h3>소주제 1</h3><p>교수님이 설명한 내용 상세히</p>
<h3>소주제 2</h3><p>예시와 함께 상세히</p>
<h2>💡 보충 설명 및 사례</h2>
<p>강의 중 언급된 예시, 경험담, 참고사항</p>
<h2>✅ 핵심 정리</h2>
<ul><li>반드시 알아야 할 포인트</li></ul>`,

    summary: `당신은 대학 강의를 정리하는 전문 학습 도우미입니다.
주어진 강의 전사 텍스트에서 핵심 내용만 추출하여 간결한 요약 노트를 만드세요.

핵심 원칙:
- 시험에 나올 핵심 개념과 중요 포인트만 추출하세요.
- 부수적인 예시나 잡담은 과감히 제거하세요.
- 출력은 순수 HTML 태그만 사용하세요.

출력 구조:
<h1>📚 강의 요약</h1>
<p>핵심 2~3문장</p>
<h2>🎯 핵심 개념</h2>
<ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 주요 내용</h2>
<h3>소주제</h3><p>설명</p>
<h2>✅ 핵심 정리</h2>
<ul><li>포인트</li></ul>`,

    transcript: `당신은 텍스트 편집 전문가입니다.
강의 전사 텍스트를 내용은 거의 그대로 유지하면서 읽기 좋게 다듬어 주세요.

핵심 원칙:
- 강의 내용의 95% 이상을 그대로 유지하세요.
- 오직 말버릇("어", "음", "그니까"), 반복 표현, 비문만 다듬으세요.
- 문어체로 바꾸고 적절한 문단 구분을 추가하세요.
- 내용을 요약하거나 삭제하지 마세요.
- 출력은 순수 HTML 태그만 사용하세요.

출력 구조:
<h1>📄 강의 전사 (정리본)</h1>
<h2>첫 번째 주제</h2>
<p>강의 내용 (원문에 최대한 가깝게, 문체만 다듬은 버전)</p>
<h2>두 번째 주제</h2>
<p>계속...</p>`,
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: prompts[mode] },
        { role: 'user', content: `아래 강의 전사 텍스트를 정리해주세요:\n\n${rawText}` },
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
    const { driveUrl, fileId: directFileId, mode = 'detailed' } = body

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
    console.log(`[Drive] File: ${fileName}, Size: ${fileSizeMB.toFixed(1)}MB, Mode: ${mode}`)

    const dlRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    )
    const audioBuffer = Buffer.from(dlRes.data as ArrayBuffer)
    const mimeType = getMimeType(fileName)

    // ── 전사: 소용량은 단일, 대용량은 24MB 청킹 ──
    let combinedText: string

    if (fileSizeMB < 24.5) {
      console.log('[Drive] Small file → single Groq Whisper transcription')
      const audioBlob = new Blob([audioBuffer.buffer as ArrayBuffer], { type: mimeType })
      combinedText = await transcribeWithGroq(audioBlob, fileName)
    } else {
      console.log(`[Drive] Large file (${fileSizeMB.toFixed(1)}MB) → chunked transcription`)
      const CHUNK_SIZE = 24 * 1024 * 1024
      const chunks: Buffer[] = []
      for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
        chunks.push(audioBuffer.slice(i, i + CHUNK_SIZE))
      }
      console.log(`[Drive] Split into ${chunks.length} chunks`)

      const transcriptions: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const chunkBlob = new Blob([chunk.buffer as ArrayBuffer], { type: mimeType })
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

    console.log(`[Drive] Transcription complete (${combinedText.length} chars). Summarizing (mode: ${mode})...`)

    // ── 요약: Groq LLaMA-3으로 HTML 강의노트 정리 ──
    const html = await summarizeWithGroqLlama(combinedText, mode as AiMode)

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
