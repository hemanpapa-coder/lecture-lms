import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

// ── Google Drive 공유 링크에서 파일 ID 추출 ──────────
function extractFileId(driveUrl: string): string | null {
  // https://drive.google.com/file/d/FILE_ID/view
  const m1 = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  // https://drive.google.com/open?id=FILE_ID
  const m2 = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m2) return m2[1]
  // https://docs.google.com/...
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

// ── Gemini File API로 대용량 오디오 전사 + 정리 ───────
async function processWithGeminiFileApi(
  audioBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  // STEP 1: Gemini File API에 파일 업로드
  console.log('[Drive] Uploading to Gemini File API...')
  const uploadRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'start, upload, finalize',
        'X-Goog-Upload-Header-Content-Length': String(audioBuffer.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': mimeType,
      },
      body: new Uint8Array(audioBuffer),
    }
  )
  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Gemini File Upload error ${uploadRes.status}: ${err}`)
  }
  const uploadData = await uploadRes.json()
  const fileUri = uploadData?.file?.uri
  if (!fileUri) throw new Error('Gemini File URI를 받지 못했습니다.')
  console.log('[Drive] Gemini File URI:', fileUri)

  // STEP 2: generateContent로 전사 + 정리
  const body = {
    contents: [
      {
        parts: [
          { fileData: { mimeType, fileUri } },
          {
            text: `이 강의 녹음 파일을 듣고, 학생들이 복습할 수 있는 체계적인 강의 노트를 HTML 형식으로 작성해 주세요.
출력 형식은 반드시 순수 HTML 태그만 사용하고 html/head/body 태그는 제외하세요.
코드 블록(\`\`\`)으로 감싸지 마세요.

구조:
<h1>📚 강의 요약</h1>
<p>이번 강의 핵심을 2~3문장으로 요약</p>
<h2>🎯 핵심 개념</h2>
<ul><li><strong>개념명</strong>: 설명</li></ul>
<h2>📖 강의 상세 내용</h2>
<h3>소주제</h3><p>상세 설명</p>
<h2>✅ 오늘의 핵심 정리</h2>
<ul><li>포인트</li></ul>

규칙: 한국어로 작성, 말버릇/반복 제거, 전사 내용에 충실하게 재구성`,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  }

  const genRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  if (!genRes.ok) {
    const err = await genRes.text()
    throw new Error(`Gemini generateContent error ${genRes.status}: ${err}`)
  }
  const genData = await genRes.json()
  let html = genData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!html) throw new Error('Gemini returned empty response')
  html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim()
  return html
}

// ── Gemini inline으로 전사 후 정리 (소파일용) ─────────
async function transcribeAndSummarizeSmall(audioBlob: Blob, mimeType: string): Promise<string> {
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
            text: `이 강의 녹음 파일을 듣고, 학생들이 복습할 수 있는 체계적인 강의 노트를 HTML 형식으로 작성해 주세요.
출력 형식은 반드시 순수 HTML 태그만 사용하고 html/head/body 태그 및 코드 블록은 제외하세요.

구조:
<h1>📚 강의 요약</h1><p>핵심 2~3문장</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념명</strong>: 설명</li></ul>
<h2>📖 강의 상세 내용</h2><h3>소주제</h3><p>설명</p>
<h2>✅ 오늘의 핵심 정리</h2><ul><li>포인트</li></ul>`,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!html) throw new Error('Gemini returned empty response')
  html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim()
  return html
}

// ── POST: Google Drive 링크 또는 fileId → AI 강의 정리 ─
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

    // 파일 ID 결정 (직접 전달 or URL에서 추출)
    let fileId: string | null = directFileId || null
    if (!fileId && driveUrl) {
      fileId = extractFileId(driveUrl)
    }
    if (!fileId) {
      return NextResponse.json({ error: '올바른 Google Drive 링크 또는 fileId가 필요합니다.' }, { status: 400 })
    }

    // Google Drive에서 파일 메타데이터 조회
    console.log('[Drive] Fetching file metadata for:', fileId)
    const drive = getDriveClient()
    const metaRes = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
    const fileName = metaRes.data.name || 'audio.mp3'
    const fileMimeType = metaRes.data.mimeType || getMimeType(fileName)
    const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
    const fileSizeMB = fileSizeBytes / (1024 * 1024)

    console.log(`[Drive] File: ${fileName}, Size: ${fileSizeMB.toFixed(1)}MB, MIME: ${fileMimeType}`)

    // Google Drive에서 파일 다운로드
    const dlRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    )
    const audioBuffer = Buffer.from(dlRes.data as ArrayBuffer)

    let html: string
    let provider: 'groq' | 'gemini'

    if (fileSizeMB < 24.5) {
      // 소용량: Groq 전사 → Gemini 정리, 또는 Gemini inline
      try {
        const mimeType = getMimeType(fileName)
        const audioBlob = new Blob([audioBuffer], { type: mimeType })
        const rawText = await transcribeWithGroq(audioBlob, fileName)
        // Groq 전사 성공 → Gemini로 HTML 정리
        const summarizeRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `아래 강의 전사 텍스트를 학생 복습용 HTML 노트로 정리해 주세요.
html/head/body 태그와 코드 블록 없이 순수 HTML만 출력하세요.

구조:
<h1>📚 강의 요약</h1><p>2~3문장</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 강의 상세 내용</h2><h3>소주제</h3><p>설명</p>
<h2>✅ 오늘의 핵심 정리</h2><ul><li>포인트</li></ul>

전사 텍스트:
${rawText}`,
                }],
              }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
            }),
          }
        )
        const sumData = await summarizeRes.json()
        html = sumData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim()
        provider = 'groq'
      } catch (groqErr: any) {
        // Groq 실패 → Gemini inline
        const mimeType = getMimeType(fileName)
        const audioBlob = new Blob([audioBuffer], { type: mimeType })
        html = await transcribeAndSummarizeSmall(audioBlob, mimeType)
        provider = 'gemini'
      }
    } else {
      // 대용량: Gemini File API
      const mimeType = getMimeType(fileName)
      html = await processWithGeminiFileApi(audioBuffer, mimeType, fileName)
      provider = 'gemini'
    }

    return NextResponse.json({ success: true, provider, html, fileName, fileSizeMB: fileSizeMB.toFixed(1) })
  } catch (err: any) {
    console.error('[TranscribeDrive API Error]', err)
    return NextResponse.json({ error: err.message || '처리 실패' }, { status: 500 })
  }
}
