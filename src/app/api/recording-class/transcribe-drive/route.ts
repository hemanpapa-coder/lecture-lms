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
    if (res.status === 429 || res.status === 402 || res.status === 413) {
      throw new Error(`GROQ_QUOTA_EXCEEDED:${res.status}:${err}`)
    }
    throw new Error(`Groq error ${res.status}: ${err}`)
  }
  return (await res.text()).trim()
}

// ── Gemini로 텍스트 → HTML 강의노트 정리 (폴백 포함) ──
async function summarizeWithGeminiOrFallback(rawText: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY

  if (apiKey) {
    try {
      const prompt = `아래 강의 전사 텍스트를 학생 복습용 HTML 노트로 정리해 주세요.
html/head/body 태그와 코드 블록 없이 순수 HTML만 출력하세요.

구조:
<h1>📚 강의 요약</h1><p>2~3문장</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 강의 상세 내용</h2><h3>소주제</h3><p>설명</p>
<h2>✅ 오늘의 핵심 정리</h2><ul><li>포인트</li></ul>

전사 텍스트:
${rawText}`

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
          }),
        }
      )
      const data = await res.json()
      if (res.ok) {
        let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim()
        if (html) return html
      }
      console.warn('[Gemini] generateContent failed, falling back to plain HTML:', data?.error?.message)
    } catch (e) {
      console.warn('[Gemini] Request error, using plain HTML fallback')
    }
  }

  // ── 폴백: 전사 텍스트를 단순 HTML로 래핑 ──
  const escaped = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<h1>📚 강의 전사 내용</h1>
<p style="color:#888;font-size:0.85em">AI 요약이 실패하여 전사 원문을 표시합니다.</p>
<pre style="white-space:pre-wrap;line-height:1.8;font-family:inherit">${escaped}</pre>`
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
    const fileMimeType = metaRes.data.mimeType || getMimeType(fileName)
    const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
    const fileSizeMB = fileSizeBytes / (1024 * 1024)
    console.log(`[Drive] File: ${fileName}, Size: ${fileSizeMB.toFixed(1)}MB, MIME: ${fileMimeType}`)

    const dlRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    )
    const audioBuffer = Buffer.from(dlRes.data as ArrayBuffer)
    const mimeType = getMimeType(fileName)

    let html: string

    if (fileSizeMB < 24.5) {
      // ── 소용량: Groq 단일 전사 → Gemini/폴백 요약 ──
      console.log('[Drive] Small file → single Groq transcription')
      const audioBlob = new Blob([audioBuffer], { type: mimeType })
      const rawText = await transcribeWithGroq(audioBlob, fileName)
      html = await summarizeWithGeminiOrFallback(rawText)
    } else {
      // ── 대용량: 24MB 청킹 → Groq 청크 전사 → Gemini/폴백 요약 ──
      console.log(`[Drive] Large file (${fileSizeMB.toFixed(1)}MB) → chunked Groq transcription`)
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

      const combinedText = transcriptions.join('\n\n[다음 구간]\n\n')
      if (!combinedText.trim()) throw new Error('모든 청크 전사에 실패했습니다.')
      html = await summarizeWithGeminiOrFallback(combinedText)
    }

    return NextResponse.json({ success: true, provider: 'groq', html, fileName, fileSizeMB: fileSizeMB.toFixed(1) })
  } catch (err: any) {
    console.error('[TranscribeDrive API Error]', err)
    return NextResponse.json({ error: err.message || '처리 실패' }, { status: 500 })
  }
}
