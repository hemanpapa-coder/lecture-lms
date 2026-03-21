import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

export const maxDuration = 300

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
    wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm',
    flac: 'audio/flac', aac: 'audio/aac',
  }
  return map[ext] || 'audio/mpeg'
}

// ── Groq Whisper 전사 ────────────────────────────────────────────
async function transcribeChunk(audioBlob: Blob, fileName: string, groqKey: string): Promise<string> {
  const MAX_RETRIES = 2
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const form = new FormData()
    form.append('file', audioBlob, fileName)
    form.append('model', 'whisper-large-v3')
    form.append('language', 'ko')
    form.append('response_format', 'text')

    // 90초 타임아웃 (Groq가 응답 없이 걸리는 경우 방지)
    const timeoutCtrl = new AbortController()
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), 90_000)
    let res: Response
    try {
      res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
        signal: timeoutCtrl.signal,
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      const isTimeout = fetchErr?.name === 'AbortError' || (fetchErr?.message || '').includes('abort')
      if (attempt < MAX_RETRIES - 1) {
        const waitSec = isTimeout ? 15 : 5
        console.warn(`[Whisper] fetch error attempt ${attempt + 1}: ${fetchErr.message}. Retrying in ${waitSec}s...`)
        await new Promise(r => setTimeout(r, waitSec * 1000))
        continue
      }
      throw new Error(`Whisper 연결 실패 (${isTimeout ? '타임아웃' : fetchErr.message})`)
    }
    clearTimeout(timeoutId)

    if (res.status === 429 || res.status === 503) {
      // 동시 요청으로 인한 Rate Limit → 즉시 Gemini로 폴백 (대기 없음)
      const errText = await res.text()
      console.warn(`[Whisper] Rate limited (${res.status}), falling back to Gemini immediately`)
      throw new Error(`GROQ_RATE_LIMITED:${res.status}:${errText}`)
    }
    if (!res.ok) {
      const errText = await res.text()
      // 마지막 시도가 아니면 짧게 재시도
      if (attempt < MAX_RETRIES - 1) {
        console.warn(`[Whisper] Error ${res.status} on attempt ${attempt + 1}, retrying in 5s...`)
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      throw new Error(`Whisper error ${res.status}: ${errText}`)
    }
    const resultText = await res.text()
    if (!resultText.trim()) {
      if (attempt < MAX_RETRIES - 1) {
        console.warn(`[Whisper] Empty response on attempt ${attempt + 1}, retrying...`)
        await new Promise(r => setTimeout(r, 3000))
        continue
      }
      // 마지막 시도도 빈 응답 → Gemini 폴백 트리거
      throw new Error('GROQ_EMPTY_RESPONSE: Whisper returned empty text')
    }
    return resultText.trim()
  }
  throw new Error('GROQ_EMPTY_RESPONSE: max retries exceeded')
}

// ── OpenAI Whisper 전사 (Groq 실패 시 1새 폴백) ──────────────────────────────
async function transcribeWithOpenAI(audioBlob: Blob, fileName: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const form = new FormData()
  form.append('file', audioBlob, fileName)
  form.append('model', 'whisper-1')
  form.append('language', 'ko')
  form.append('response_format', 'text')

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 120_000) // 2분 타임아웃
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal,
    })
    clearTimeout(tid)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI Whisper 오류 ${res.status}: ${err.slice(0, 100)}`)
    }
    const text = await res.text()
    if (!text.trim()) throw new Error('OpenAI Whisper 빈 응답')
    return text.trim()
  } catch (e: any) {
    clearTimeout(tid)
    throw e
  }
}

// ── Gemini 오디오 전사 (Groq 대안) — inline_data 방식 ─────────────────
async function transcribeWithGemini(audioBlob: Blob, geminiKey: string): Promise<string> {
  const mimeType = audioBlob.type || 'audio/mpeg'
  const arrayBuf = await audioBlob.arrayBuffer()
  const base64 = Buffer.from(arrayBuf).toString('base64')

  const MAX_RETRIES = 2
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: '이 오디오를 한국어로 정확하게 전사해주세요. 말버릇(어, 음, 그니까)은 포함하되 최대한 원본 그대로 출력하세요. 전사 내용만 출력하고 다른 설명은 하지 마세요.' },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
      }
    )
    if (!res.ok) {
      const errText = await res.text().catch(() => res.status.toString())
      const isTransient = res.status === 503 || res.status === 429
      if (isTransient && attempt < MAX_RETRIES - 1) {
        console.warn(`[Gemini] 전사 ${res.status} 재시도 (${attempt + 1}/${MAX_RETRIES})...`)
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      throw new Error(`Gemini 전사 HTTP ${res.status}: ${errText.slice(0, 200)}`)
    }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text.trim()) {
      const blockReason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '알 수 없음'
      throw new Error(`Gemini 전사 결과 없음 (사유: ${blockReason})`)
    }
    return text.trim()
  }
  throw new Error('Gemini 전사 최대 재시도 초과')
}

// ── Gemini File API: 대용량 청크를 업로드 뒤 URI로 전사 (이진 MP3 슬라이스에 안정적) ───
async function uploadToGeminiFileAPI(data: Buffer, mimeType: string, apiKey: string): Promise<string | null> {
  try {
    const startRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': data.length.toString(),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: `chunk_${Date.now()}` } }),
      }
    )
    if (!startRes.ok) {
      console.warn('[GeminiFile] Upload start failed:', startRes.status)
      return null
    }
    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL')
    if (!uploadUrl) return null

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': data.length.toString(),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: new Uint8Array(data),
    })
    if (!uploadRes.ok) return null
    const result = await uploadRes.json()
    const uri = result.file?.uri
    console.log(`[GeminiFile] Uploaded ${(data.length/1024/1024).toFixed(1)}MB → ${uri}`)
    return uri || null
  } catch (e: any) {
    console.warn('[GeminiFile] Upload error:', e.message)
    return null
  }
}

async function transcribeWithGeminiFileURI(fileUri: string, mimeType: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: '이 오디오를 한국어로 정확하게 전사해주세요. 말버릇(어, 음, 그니까)은 포함하되 최대한 원본 그대로 출력하세요. 전사 내용만 출력하고 다른 설명은 하지 마세요.' },
            { file_data: { mime_type: mimeType, file_uri: fileUri } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  )
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini FileURI 전사 실패 ${res.status}: ${errText.slice(0, 100)}`)
  }
  const responseData = await res.json()
  const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text.trim()) {
    const reason = responseData?.candidates?.[0]?.finishReason || '?'
    throw new Error(`Gemini FileURI 결과 없음 (이유: ${reason})`)
  }
  return text.trim()
}

// ── Gemini 대용량 blob 안전 전사: File API 우선, inline_data 폴백 ────────────────
const GEMINI_SAFE_CHUNK = 8 * 1024 * 1024 // 8MB
async function transcribeWithGeminiSafe(audioBlob: Blob, geminiKey: string): Promise<string> {
  const mimeType = audioBlob.type || 'audio/mpeg'
  const buf = Buffer.from(await audioBlob.arrayBuffer())

  // 1단계: Gemini File API 시도 (MP3 이진 슬라이스를 서버에서 디코딩 — inline_data보다 안정적)
  const fileUri = await uploadToGeminiFileAPI(buf, mimeType, geminiKey)
  if (fileUri) {
    try {
      return await transcribeWithGeminiFileURI(fileUri, mimeType, geminiKey)
    } catch (e: any) {
      console.warn(`[GeminiFileURI] 전사 실패, inline_data로 폴백: ${e.message}`)
      // File API 전사 실패 시 inline_data로 폴백
    }
  }

  // 2단계: File API 업로드 실패 또는 전사 실패 → inline_data 폴백 (8MB 이하로 분할)
  if (audioBlob.size <= GEMINI_SAFE_CHUNK) {
    return transcribeWithGemini(audioBlob, geminiKey)
  }
  // 대용량 → 청크 분할 후 순서대로 병합
  const results: string[] = []
  for (let offset = 0; offset < audioBlob.size; offset += GEMINI_SAFE_CHUNK) {
    const slice = audioBlob.slice(offset, offset + GEMINI_SAFE_CHUNK, audioBlob.type)
    const text = await transcribeWithGemini(slice, geminiKey)
    results.push(text)
  }
  return results.join('\n')
}

// ── Deepgram Nova-2 전사 ─────────────────────────────────────────
async function transcribeWithDeepgram(audioBlob: Blob, deepgramKey: string): Promise<string> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 120_000)
  try {
    const res = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&language=ko&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': audioBlob.type || 'audio/mpeg',
        },
        body: audioBlob,
        signal: ctrl.signal,
      }
    )
    clearTimeout(tid)
    if (res.status === 429 || res.status === 402) {
      const err = await res.text()
      throw new Error(`QUOTA_EXCEEDED:Deepgram:${res.status}:${err.slice(0, 80)}`)
    }
    if (!res.ok) throw new Error(`Deepgram 오류 ${res.status}`)
    const data = await res.json()
    const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    if (!text.trim()) throw new Error('Deepgram 빈 응답')
    return text.trim()
  } catch (e: any) {
    clearTimeout(tid)
    throw e
  }
}

// ── Azure Speech-to-Text 전사 ────────────────────────────────────
async function transcribeWithAzure(audioBlob: Blob, azureKey: string, azureRegion: string): Promise<string> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 120_000)
  try {
    // Azure REST API (단기 오디오, 최대 60초 — 청크 전사에 적합)
    const res = await fetch(
      `https://${azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ko-KR&format=detailed`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
          'Content-Type': audioBlob.type || 'audio/mpeg',
          'Transfer-Encoding': 'chunked',
        },
        body: audioBlob,
        signal: ctrl.signal,
      }
    )
    clearTimeout(tid)
    if (res.status === 429) {
      const err = await res.text()
      throw new Error(`QUOTA_EXCEEDED:Azure:${res.status}:${err.slice(0, 80)}`)
    }
    if (!res.ok) throw new Error(`Azure 오류 ${res.status}`)
    const data = await res.json()
    const text = data?.DisplayText || data?.NBest?.[0]?.Display || ''
    if (!text.trim()) throw new Error('Azure 빈 응답')
    return text.trim()
  } catch (e: any) {
    clearTimeout(tid)
    throw e
  }
}

// ── 자동 폴백 전사: Groq → Deepgram → Azure → OpenAI → Gemini ────
// 사용량 초과(QUOTA_EXCEEDED) 또는 에러 시 해당 청크를 버리지 않고 다음 제공자로 전환
async function cascadeTranscribe(
  audioBlob: Blob,
  fileName: string,
  keys: {
    groq?: string
    deepgram?: string
    azure?: { key: string; region: string }
    openai?: string
    gemini: string
  },
  onProviderChange?: (msg: string) => void
): Promise<string> {
  const isQuotaError = (e: Error) =>
    e.message.startsWith('QUOTA_EXCEEDED') ||
    e.message.startsWith('GROQ_RATE_LIMITED') ||
    e.message.startsWith('GROQ_EMPTY_RESPONSE') ||
    e.message.includes('429') ||
    e.message.includes('503') ||
    e.message.includes('rate limit') ||
    e.message.includes('quota')

  // 1순위: Groq Whisper
  if (keys.groq) {
    try {
      onProviderChange?.('🎤 Groq Whisper로 전사 중...')
      const text = await transcribeChunk(audioBlob, fileName, keys.groq)
      return text
    } catch (e: any) {
      if (isQuotaError(e)) {
        console.warn('[cascade] Groq 사용량 초과/실패 → Deepgram으로 전환')
        onProviderChange?.('⚡ Groq 사용량 초과 → Deepgram으로 전환 중...')
      } else {
        console.warn('[cascade] Groq 에러 → Deepgram으로 전환:', e.message)
        onProviderChange?.(`⚠️ Groq 오류 → Deepgram으로 전환 중... (${e.message.slice(0, 50)})`)
      }
    }
  }

  // 2순위: Deepgram Nova-2
  if (keys.deepgram) {
    try {
      onProviderChange?.('🎤 Deepgram Nova-2로 전사 중...')
      const text = await transcribeWithDeepgram(audioBlob, keys.deepgram)
      return text
    } catch (e: any) {
      if (isQuotaError(e)) {
        onProviderChange?.('⚡ Deepgram 사용량 초과 → Azure로 전환 중...')
      } else {
        onProviderChange?.(`⚠️ Deepgram 오류 → Azure로 전환 중... (${e.message.slice(0, 50)})`)
      }
      console.warn('[cascade] Deepgram 실패:', e.message)
    }
  }

  // 3순위: Azure Speech-to-Text
  if (keys.azure) {
    try {
      onProviderChange?.('🎤 Azure Speech로 전사 중...')
      const text = await transcribeWithAzure(audioBlob, keys.azure.key, keys.azure.region)
      return text
    } catch (e: any) {
      if (isQuotaError(e)) {
        onProviderChange?.('⚡ Azure 사용량 초과 → OpenAI Whisper로 전환 중...')
      } else {
        onProviderChange?.(`⚠️ Azure 오류 → OpenAI Whisper로 전환 중... (${e.message.slice(0, 50)})`)
      }
      console.warn('[cascade] Azure 실패:', e.message)
    }
  }

  // 4순위: OpenAI Whisper
  if (keys.openai) {
    try {
      onProviderChange?.('🎤 OpenAI Whisper로 전사 중...')
      const text = await transcribeWithOpenAI(audioBlob, fileName)
      return text
    } catch (e: any) {
      onProviderChange?.(`⚠️ OpenAI 오류 → Gemini로 전환 중... (${e.message.slice(0, 50)})`)
      console.warn('[cascade] OpenAI 실패:', e.message)
    }
  }

  // 5순위 (최종): Gemini (유료, 이미 키 있음)
  onProviderChange?.('🎤 Gemini로 전사 중... (유료)')
  return transcribeWithGeminiSafe(audioBlob, keys.gemini)
}



// ── Groq 텍스트 생성 (자동 재시도) ─────────────────────────────
async function callGroq(
  systemPrompt: string,
  userContent: string,
  groqKey: string,
  model = 'llama-3.1-8b-instant',
  maxTokens = 4096
): Promise<string> {
  const MAX_RETRIES = 6
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    })
    if (res.status === 429) {
      const errText = await res.text()
      const match = errText.match(/try again in (\d+(?:\.\d+)?)s/i)
      const waitSec = match ? Math.ceil(parseFloat(match[1])) + 3 : 65
      console.log(`[${model}] Rate limited. Waiting ${waitSec}s (retry ${attempt + 1}/${MAX_RETRIES})...`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
      continue
    }
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    let text = data?.choices?.[0]?.message?.content || ''
    text = text.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return text
  }
  throw new Error(`${model}: 최대 재시도 횟수 초과. Groq TPM 한도 도달.`)
}

// ── Gemini API 호출 (100만 토큰 컨텍스트) ───────────────────────
async function callGemini(
  prompt: string,
  geminiKey: string,
  preferredModel = 'gemini-2.0-flash'
): Promise<string> {
  const MAX_RETRIES = 3
  const fallbacks: Record<string, string[]> = {
    'gemini-3.1-pro-preview': ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    'gemini-2.5-pro':   ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
    'gemini-2.0-flash': ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    'gemini-1.5-flash': ['gemini-1.5-flash', 'gemini-2.0-flash'],
    'gemini-1.5-pro':   ['gemini-1.5-pro', 'gemini-2.0-flash'],
  }
  const models = fallbacks[preferredModel] || [preferredModel, 'gemini-2.0-flash']

  for (const model of models) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
          }),
        }
      )
      if (res.status === 429 || res.status === 503) {
        const waitSec = attempt === 0 ? 30 : 60 * (attempt + 1)
        console.log(`[Gemini:${model}] Rate limited. Waiting ${waitSec}s...`)
        await new Promise(r => setTimeout(r, waitSec * 1000))
        continue
      }
      if (res.status === 404) { console.log(`[Gemini] ${model} not found, trying next...`); break }
      if (!res.ok) {
        const err = await res.text()
        if (err.includes('quota') || err.includes('RESOURCE_EXHAUSTED')) {
          console.log(`[Gemini] ${model} quota exceeded, trying next model...`); break
        }
        throw new Error(`Gemini error ${res.status}: ${err}`)
      }
      const data = await res.json()
      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      text = text.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      if (text) {
        console.log(`[Gemini] Success with model: ${model}`)
        return text
      }
    }
  }
  throw new Error('Gemini API: 사용 가능한 모델이 없거나 할당량 초과. Google Cloud 콘솔에서 확인해주세요.')
}

function splitByWords(text: string, maxWords = 1500): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '))
  }
  return chunks
}

// ── SCRIBE 모드 (detailed) ───────────────────────────────────────
const SCRIBE_SYSTEM = `당신은 강의 속기사(scribe)입니다.
입력된 강의 전사 텍스트를 아래 규칙에 따라 처리하세요.

[절대 금지]
- 내용 요약, 압축, 생략 금지
- 어떤 내용도 버리지 말 것

[해야 할 것]
- "어", "음", "그니까", "뭐", "저" 같은 말버릇만 제거
- 구어체를 자연스러운 문어체로 변환
- 같은 내용 반복만 1번으로 정리
- 교수님이 든 모든 예시, 경험담, 비유, 부연설명 포함
- 문단 구분을 추가하고 소제목을 붙이되 내용은 그대로 유지

[출력 형식]
순수 HTML. html/head/body 태그 없음. 코드 블록 없음.
<h3>소제목</h3><p>정제된 강의 내용</p><ul><li>예시나 열거 항목</li></ul>`

async function processDetailed(
  textChunks: string[], groqKey: string, groqModel: string, send: (d: object) => void
): Promise<string> {
  const sections: string[] = []
  for (let i = 0; i < textChunks.length; i++) {
    send({
      stage: `scribe_${i + 1}`,
      message: `✍️ 강의 내용 정서 중... ${i + 1}/${textChunks.length}번째 구간`,
      progress: 67 + Math.floor((i / textChunks.length) * 25),
    })
    const result = await callGroq(SCRIBE_SYSTEM, `아래 강의 전사 텍스트를 정서하세요:\n\n${textChunks[i]}`, groqKey, groqModel)
    sections.push(result)
  }

  send({ stage: 'toc', message: '📑 목차 생성 중...', progress: 93 })

  const tocSystem = `당신은 HTML 문서 편집자입니다.
아래 여러 강의 섹션 HTML을 받아서:
1. 전체를 감싸는 <h1>📚 [강의 제목 추론]</h1><p>강의 개요 2~3줄</p>를 맨 앞에 추가
2. 각 섹션을 순서대로 이어 붙이기 (내용 수정 절대 금지)
3. 맨 끝에 <h2>✅ 전체 핵심 정리</h2><ul><li>섹션별 핵심 1줄씩</li></ul> 추가

출력: 순수 HTML. 내용 삭제나 요약 절대 금지.`

  return await callGroq(tocSystem, sections.join('\n\n'), groqKey, groqModel)
}

// ── SUMMARY 모드 (MapReduce) ─────────────────────────────────────
async function processSummary(
  textChunks: string[], groqKey: string, groqModel: string, send: (d: object) => void
): Promise<string> {
  const MAP_SYSTEM = `이 강의 섹션에서 핵심 개념과 중요 포인트만 추출하세요.
출력: 순수 HTML. <h3>주제</h3><ul><li><strong>개념</strong>: 설명</li></ul>`

  const summaries: string[] = []
  for (let i = 0; i < textChunks.length; i++) {
    send({
      stage: `map_${i + 1}`,
      message: `🔍 핵심 추출 중... ${i + 1}/${textChunks.length}번째`,
      progress: 67 + Math.floor((i / textChunks.length) * 20),
    })
    const s = await callGroq(MAP_SYSTEM, textChunks[i], groqKey, groqModel)
    summaries.push(s)
  }

  send({ stage: 'reduce', message: '📝 최종 요약 통합 중...', progress: 88 })

  const REDUCE_SYSTEM = `여러 강의 섹션의 핵심 내용을 하나의 완성된 강의 요약 노트로 통합하세요.
중복 제거하고 논리적으로 재구성하세요. 출력: 순수 HTML.
<h1>📚 강의 요약</h1><p>2~3문장 개요</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 주요 내용</h2><h3>소주제</h3><p>설명</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>`

  return await callGroq(REDUCE_SYSTEM, summaries.join('\n\n'), groqKey, groqModel)
}

// ── TRANSCRIPT 모드 (최소 정제) ──────────────────────────────────
async function processTranscript(
  textChunks: string[], groqKey: string, groqModel: string, send: (d: object) => void
): Promise<string> {
  const SYSTEM = `강의 전사 텍스트의 말버릇("어", "음", "그니까", "저", "뭐")과 완전한 문장이 아닌 반복만 제거하세요.
내용은 95% 이상 그대로 유지. 문어체로 변환. 문단 구분 추가.
출력: 순수 HTML. <h2>주제</h2><p>정제된 내용</p>`

  const sections: string[] = []
  for (let i = 0; i < textChunks.length; i++) {
    send({
      stage: `clean_${i + 1}`,
      message: `🧹 텍스트 정제 중... ${i + 1}/${textChunks.length}번째`,
      progress: 67 + Math.floor((i / textChunks.length) * 28),
    })
    const s = await callGroq(SYSTEM, textChunks[i], groqKey, groqModel)
    sections.push(s)
  }

  return `<h1>📄 강의 전사 정리본</h1>\n` + sections.join('\n\n')
}

// Gemini용 프롬프트 생성
function buildGeminiPrompt(mode: string, fullText: string, courseContext?: string, compressionRatio: number = 80): string {
  const CONTEXT_BLOCK = courseContext ? `
[수업 전문 지식 - 중요]
아래는 이 수업의 전문 분야·용어·보정 지침입니다. 강의를 정리할 때 반드시 이 내용을 참고하여:
1. 전문 용어가 잘못 전사된 경우 올바른 용어로 교정
2. 설명이 불완전한 경우 전문 지식으로 보완
3. 개념 설명이 필요한 경우 짧은 정의 추가
---
${courseContext}
---
` : ''
  const VISUAL_INSTRUCTIONS = `
[시각화 - 중요]
강의 내용을 정리하면서 아래 개념에 해당하는 곳에 시각화 마커를 삽입하세요:
- 단계별 프로세스, 신호 흐름, 절차 → <!--DIAGRAM: 구체적인 내용 설명-->
- 비교, 구성 비율, 통계 → <!--CHART: 구체적인 내용 설명-->  
- 개념 설명을 위한 삽화, 예시 그림 → <!--IMAGE: 구체적인 내용 설명-->
마커는 해당 설명 직후에 삽입. 강의 1개당 2~5개 정도 적절히 사용.
`

  const REFERENCE_INSTRUCTIONS = `
[참조/주석 - 중요: 반드시 실제 링크 포함]
주요 개념/전문용어 첫 등장 시 인라인 번호: <sup><a href="#ref-1">[1]</a></sup>
문서 마지막에 반드시 아래와 같은 형식의 참고 자료 섹션을 추가하세요:
<hr/>
<div class="references"><h2>📚 참고 자료 및 출처</h2><ol>
<li id="ref-1"><strong>개념명</strong> — 설명 1~2줄.<br/>
  📖 <a href="https://ko.wikipedia.org/wiki/정확한_문서명" target="_blank" rel="noopener">위키백과: 개념명</a>
</li>
<li id="ref-2"><strong>개념명</strong> — 설명.<br/>
  📚 전문서적: 저자명, 『서명』, 출판사, 연도, p.XXX (해당 내용이 다뤄지는 대략적인 페이지)
</li>
</ol></div>

규칙:
- 위키백과 URL은 반드시 https://ko.wikipedia.org/wiki/ 형식. 예: https://ko.wikipedia.org/wiki/전압
- 영어 위키가 더 정확하면 https://en.wikipedia.org/wiki/Voltage 도 가능
- 전문서적: 음향/음악이면 "Mike Senior, 『Mixing Secrets for the Small Studio』", 전기면 "이길환, 『전기공학개론』" 등 실제 존재하는 서적
- 강의 1개당 4~8개 참조 생성. 링크 없는 참조는 만들지 말 것.
`


  const COMPRESSION_INSTRUCTION = compressionRatio >= 100
    ? `\n[분량 지침 — 전체 보존 모드]\n강의에서 언급된 내용을 빠짐없이 모두 포함하세요. 말버릇("어","음","그니까")과 완전한 중복 반복만 제거하고, 교수님의 모든 예시·경험담·비유·부연설명을 그대로 포함해야 합니다. 요약하거나 생략하지 마세요.\n`
    : `\n[분량 지침]\n원본 강의 전사 분량 대비 ${compressionRatio}% 분량을 목표로 정리하세요.${compressionRatio <= 40 ? '\n핵심 개념과 중요한 예시만 남기고 반복, 부가 설명은 과감히 생략하세요.' : compressionRatio <= 70 ? '\n중요도가 낮은 반복 설명과 부가적 언급은 줄이고 핵심 내용 위주로 정리하세요.' : '\n내용을 최대한 보존하되 불필요한 반복만 제거하세요.'}\n`

  const prompts: Record<string, string> = {
    detailed: `당신은 강의 속기사(scribe)입니다. 아래 강의 전사 텍스트를 아래 규칙에 따라 처리하세요.
${COMPRESSION_INSTRUCTION}
[절대 금지]
- 내용 임의 생략 금지. 반드시 분량 지침 준수.

[해야 할 것]
- "어", "음", "그니까", "뭐", "저" 같은 말버릇만 제거
- 구어체를 문어체로 자연스럽게 변환
- 완전한 중복 반복만 1번으로 정리
- 교수님의 모든 예시, 경험담, 비유, 부연설명 포함
- 논리적 흐름으로 소제목 붙여 구조화
${VISUAL_INSTRUCTIONS}
${REFERENCE_INSTRUCTIONS}
${CONTEXT_BLOCK}
[출력 형식] 순수 HTML. html/head/body 태그 없음.
<h1>📚 강의 전체 정리</h1>
<h2>주제 섹션</h2><h3>소주제</h3><p>내용</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>

강의 전사:
${fullText}`,

    summary: `아래 강의 전사 텍스트에서 핵심 개념과 중요 포인트를 추출하여 간결한 강의 요약 노트를 만드세요.
${VISUAL_INSTRUCTIONS}
${CONTEXT_BLOCK}
출력: 순수 HTML.
<h1>📚 강의 요약</h1><p>2~3문장</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 주요 내용</h2><h3>소주제</h3><p>설명</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>

강의 전사:
${fullText}`,

    transcript: `아래 강의 전사 텍스트에서 말버릇("어","음","그니까")과 비문만 제거하고 내용은 95% 이상 그대로 유지하세요.
문어체로 변환하고 문단 구분을 추가하세요. 출력: 순수 HTML.
<h1>📄 강의 전사 정리본</h1>
<h2>주제</h2><p>정제된 내용</p>

강의 전사:
${fullText}`,
  }
  return prompts[mode] || prompts.detailed
}

// ── 시각화 마커 처리 ──────────────────────────────────────────
// 마커 유형:
//   <!--DIAGRAM: 설명-->  → 🍌 Nano Banana AI 이미지
//   <!--CHART: 설명-->    → 🍌 Nano Banana AI 이미지
//   <!--IMAGE: 설명-->    → 🍌 Nano Banana AI 이미지

async function callGeminiForMermaid(description: string, type: 'diagram' | 'chart', geminiKey: string): Promise<string> {
  const systemPrompt = type === 'diagram'
    ? `당신은 Mermaid.js 전문가입니다. 주어진 설명을 Mermaid flowchart 코드로 변환하세요.
출력 형식: 오직 mermaid 코드 블록만. 설명 없이.
예시:
\`\`\`mermaid
flowchart LR
  A[마이크] --> B[프리앰프] --> C[AD변환] --> D[DAW]
\`\`\`
한국어 레이블 사용 가능. 간결하고 명확하게.`
    : `당신은 Mermaid.js 전문가입니다. 주어진 설명을 Mermaid pie 또는 xychart-beta 코드로 변환하세요.
출력 형식: 오직 mermaid 코드 블록만. 설명 없이.
예시:
\`\`\`mermaid
pie title 구성 비율
  "A" : 40
  "B" : 35
  "C" : 25
\`\`\`
또는 xychart-beta for bar/line charts.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: description }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    }
  )
  if (!res.ok) return ''
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  // mermaid 코드 블록 추출
  const match = text.match(/```mermaid\s*([\s\S]+?)\s*```/)
  return match ? match[1].trim() : ''
}

async function generateImageBase64(description: string, geminiKey: string): Promise<string | null> {
  const prompt = `Educational lecture illustration for: ${description}. 
Clean infographic style, white background, minimal design, clear labels in Korean where appropriate.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.4,
        },
      }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
    }
  }
  return null
}

// ── 시각화 마커 → 온디맨드 버튼으로 변환 ──────────────────────
// 버튼 클릭 → window._visClick(btn, type, desc, altType) 전역 함수 → 미리보기/삽입
function processVisuals(html: string): string {
  let visIdx = 0
  let result = html

  const hasMarker = result.includes('<!--DIAGRAM:') || result.includes('<!--CHART:') || result.includes('<!--IMAGE:')
  if (!hasMarker) return result

  // 전역 핸들러를 script 태그로 한 번만 삽입. onclick은 단순 호출만.
  const SCRIPT = `<script>
if(!window._visClick){window._visClick=function(btn,type,desc,altType){
var el=btn.closest('.gen-visual-btn');if(!el)return;
var orig=el.innerHTML;
btn.disabled=true;btn.textContent='\u23F3 \uC0DD\uC131 \uC911...';
fetch('/api/generate-visual',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({type:type,description:desc})}).then(function(r){return r.json()}).then(function(d){
if(d.ok&&d.html){
var isMerm=(d.type==='mermaid');
var wrap=document.createElement('div');
wrap.style.cssText='background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;padding:14px;';
var pvDiv=document.createElement('div');
if(isMerm){pvDiv.className='mermaid';pvDiv.style.cssText='padding:12px;background:#f8fafc;border-radius:8px;';pvDiv.textContent=d.mermaidCode||'';}
else{pvDiv.innerHTML=d.html;}
var hdr=document.createElement('p');
hdr.style.cssText='margin:0 0 10px;font-size:12px;font-weight:800;color:#16a34a;';
hdr.textContent='\u2728 \uC0DD\uC131 \uC644\uB8CC \u2014 \uB9C8\uC74C\uC5D0 \uB4DC\uC2DC\uB098\uC694?';
var row=document.createElement('div');row.style.cssText='display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;';
var bOk=document.createElement('button');bOk.textContent='\u2705 \uC0BD\uC785';
bOk.style.cssText='flex:1;padding:8px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;min-width:70px;';
var bRe=document.createElement('button');bRe.textContent='\uD83D\uDD04 \uB2E4\uC2DC \uB9CC\uB4E4\uAE30';
bRe.style.cssText='flex:1;padding:8px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;font-size:11px;cursor:pointer;min-width:70px;';
row.appendChild(bOk);row.appendChild(bRe);
if(altType){var bAlt=document.createElement('button');bAlt.textContent='\uD83D\uDD00 \uB2E4\uB978 \uBC29\uC2DD';
bAlt.style.cssText='flex:1;padding:8px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;font-size:11px;cursor:pointer;min-width:70px;';
bAlt.onclick=function(){el.innerHTML=orig;var bs=el.querySelectorAll('button');if(bs.length>1)bs[bs.length-1].click();};
row.appendChild(bAlt);}
wrap.appendChild(hdr);wrap.appendChild(pvDiv);wrap.appendChild(row);
el.innerHTML='';el.appendChild(wrap);
if(isMerm&&window.mermaid)setTimeout(function(){window.mermaid.run({nodes:[pvDiv]});},150);
bOk.onclick=function(){var tmp=document.createElement('div');tmp.innerHTML=d.html;
el.parentNode.replaceChild(tmp.firstChild||tmp,el);
if(isMerm&&window.mermaid)setTimeout(function(){window.mermaid.run();},150);};
bRe.onclick=function(){el.innerHTML=orig;var nb=el.querySelector('button');if(nb)nb.click();};
}else{el.innerHTML=orig;
var em=document.createElement('p');em.style.cssText='margin:6px 0 0;font-size:10px;color:#dc2626;';
em.textContent='\u26A0\uFE0F '+(d.error||'\uC0DD\uC131 \uC2E4\uD328')+' \u2014 \uB2E4\uB978 \uBC29\uC2DD\uC744 \uC2DC\uB3C4\uD574\uBCF4\uC138\uC694.';
el.appendChild(em);}
}).catch(function(){el.innerHTML=orig;});
};}
</script>`

  result = SCRIPT + result

  // ── DIAGRAM / CHART / IMAGE → 🍌 나노바나나 AI 이미지 단일 버튼 ──
  const STRUCT: Record<string, {emoji:string;label:string;color:string;bg:string;border:string}> = {
    DIAGRAM: {emoji:'📊',label:'흐름도',  color:'#6366f1',bg:'#eef2ff',border:'#c7d2fe'},
    CHART:   {emoji:'📈',label:'차트',    color:'#0891b2',bg:'#ecfeff',border:'#a5f3fc'},
  }
  for (const [typeName, cfg] of Object.entries(STRUCT)) {
    result = result.replace(new RegExp(`<!--${typeName}:\\s*(.+?)-->`, 'g'), (_match: string, desc: string) => {
      const id = `vis-${++visIdx}`
      const sa = desc.trim().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      return `<div class="gen-visual-btn" id="${id}" data-vdesc="${sa}" data-vtype="image" style="margin:1rem 0;padding:14px 16px;background:${cfg.bg};border:1.5px dashed ${cfg.border};border-radius:12px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><span style="font-size:22px">${cfg.emoji}</span><div style="flex:1;min-width:0;"><p style="margin:0;font-size:11px;font-weight:700;color:${cfg.color};">${cfg.label} 삽입</p><p style="margin:2px 0 0;font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sa.slice(0,80)}</p></div></div><div style="display:flex;gap:8px;"><button onclick="window._visClick(this,'image',this.closest('[data-vdesc]').dataset.vdesc)" style="flex:1;padding:7px 0;background:${cfg.color};color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">🍌 AI 이미지 생성</button><button onclick="this.closest('.gen-visual-btn').remove()" style="padding:7px 12px;background:#f1f5f9;color:#94a3b8;border:1.5px solid #e2e8f0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">✕ 삽입 안 함</button></div></div>`
    })
  }

  // ── IMAGE → 🍌 나노바나나 단일 버튼 ──
  result = result.replace(/<!--IMAGE:\s*(.+?)-->/g, (_match: string, desc: string) => {
    const id = `vis-${++visIdx}`
    const sa = desc.trim().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    return `<div class="gen-visual-btn" id="${id}" data-vdesc="${sa}" style="margin:1rem 0;padding:14px 16px;background:#faf5ff;border:1.5px dashed #ddd6fe;border-radius:12px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><span style="font-size:22px">🖼️</span><div style="flex:1;min-width:0;"><p style="margin:0;font-size:11px;font-weight:700;color:#7c3aed;">시각 자료 삽입</p><p style="margin:2px 0 0;font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sa.slice(0,80)}</p></div></div><div style="display:flex;gap:8px;"><button onclick="window._visClick(this,'image',this.closest('[data-vdesc]').dataset.vdesc)" style="flex:1;padding:7px 0;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">🍌 AI로 만들기</button><button onclick="this.closest('.gen-visual-btn').remove()" style="padding:7px 12px;background:#f1f5f9;color:#94a3b8;border:1.5px solid #e2e8f0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">✕ 삽입 안 함</button></div></div>`
  })

  return result
}

// ── YouTube 관련 강의 검색 (Gemini Google Search grounding) ────
async function addYouTubeSection(html: string, geminiKey: string): Promise<string> {
  try {
    // Gemini에게 강의 텍스트 분석 후 관련 YouTube 검색어 3-5개 추출 + URL 추천
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `다음 강의 내용을 분석하여 관련된 교육적 YouTube 영상을 찾아주세요.

[강의 내용 요약]
${plainText}

[요청]
이 강의와 관련된 YouTube 공개 강의/교육 영상 4-6개를 찾아주세요.
반드시 실제로 존재하는 영상의 URL을 포함해야 합니다.

[출력 형식] JSON만 출력. 다른 텍스트 없이.
[
  {"title": "영상 제목", "url": "https://www.youtube.com/watch?v=...", "channel": "채널명", "reason": "이 강의와의 연관성 1줄"},
  ...
]`
            }]
          }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      }
    )

    if (!res.ok) return html

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // JSON 파싱
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return html

    let videos: Array<{ title: string; url: string; channel: string; reason: string }> = []
    try { videos = JSON.parse(jsonMatch[0]) } catch { return html }

    if (videos.length === 0) return html

    const ytHtml = `
<div class="youtube-bookmarks" style="margin-top:2rem;padding:1.5rem;background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;">
  <h2 style="font-size:1.1rem;font-weight:800;color:#ea580c;margin:0 0 1rem;">🎬 관련 유튜브 강의</h2>
  <div style="display:grid;gap:0.75rem;">
    ${videos.map((v, i) => `
    <a href="${v.url}" target="_blank" rel="noopener noreferrer"
      style="display:flex;gap:12px;padding:12px;background:white;border:1px solid #fed7aa;border-radius:10px;text-decoration:none;color:inherit;transition:box-shadow 0.2s;"
    >
      <span style="font-size:1.4rem;flex-shrink:0;">▶️</span>
      <div>
        <p style="margin:0;font-size:13px;font-weight:700;color:#1a1a1a;">${v.title}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">${v.channel}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${v.reason}</p>
      </div>
    </a>`).join('')}
  </div>
</div>`

    return html + ytHtml
  } catch {
    return html
  }
}





// ── POST 핸들러 ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return new Response('Forbidden', { status: 403 })

  const body = await req.json()
  const {
    fileId,
    mode = 'detailed',
    aiProvider = 'groq',
    aiModel = '',  // '' → 각 제공자의 기본 모델
    transcriptionProvider = 'groq',  // 'groq'=Whisper / 'gemini'=Gemini Audio
    courseId = '',  // 과목별 AI 컨텍스트 로드에 사용
    compressionRatio = 100,  // 20~100: 정리 분량 비율(%). 100 = 전체 보존
  } = body
  if (!fileId) return new Response('fileId required', { status: 400 })

  const groqKey = process.env.GROQ_API_KEY!
  const geminiKey = process.env.GEMINI_API_KEY || ''

  // 모델 결정
  const groqModel = aiModel || 'llama-3.1-8b-instant'
  const geminiModel = aiModel || 'gemini-2.0-flash'

  // 과목별 AI 컨텍스트 로드
  let courseContext = ''
  if (courseId) {
    try {
      const { data: ctxRow } = await supabase
        .from('settings')
        .select('value')
        .eq('key', `ai_course_context_${courseId}`)
        .single()
      courseContext = ctxRow?.value || ''
    } catch {}
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const modelLabel = aiProvider === 'gemini'
          ? `Gemini ${geminiModel.replace('gemini-', '')}`
          : `Groq ${groqModel.replace('llama-', 'LLaMA-').replace('-versatile', ' 70B').replace('-instant', ' 8B')}`

        send({ stage: 'init', message: `📁 파일 정보 가져오는 중... (${modelLabel})`, progress: 2 })

        const drive = getDriveClient()
        const metaRes = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
        const fileName = metaRes.data.name || 'audio.mp3'
        const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
        const fileSizeMB = fileSizeBytes / (1024 * 1024)
        const mimeType = getMimeType(fileName)

        send({ stage: 'downloading', message: `⬇️ 파일 다운로드 중... (${fileSizeMB.toFixed(0)}MB)`, progress: 5 })

        const dlRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
        const audioBuffer = Buffer.from(dlRes.data as ArrayBuffer)

        // 전사 청킹 — Gemini inline_data 제한: 청크당 10MB 이하
        const AUDIO_CHUNK = transcriptionProvider === 'gemini' ? 10 * 1024 * 1024 : 24 * 1024 * 1024
        const audioChunks: Buffer[] = []
        for (let i = 0; i < audioBuffer.length; i += AUDIO_CHUNK) {
          audioChunks.push(audioBuffer.slice(i, i + AUDIO_CHUNK))
        }

        const transcriptions: string[] = []
        for (let i = 0; i < audioChunks.length; i++) {
          const chunkProgress = 10 + Math.floor((i / audioChunks.length) * 55)
          send({
            stage: `transcribe_${i + 1}`,
            message: `🎤 음성 전사 중... ${i + 1}/${audioChunks.length}번째 구간 · ${transcriptionProvider === 'gemini' ? 'Gemini' : 'Groq Whisper'}`,
            progress: chunkProgress,
          })
          const blob = new Blob([new Uint8Array(audioChunks[i])], { type: mimeType })

          // Groq 처리 중 SSE 연결이 끊기지 않도록 15초마다 keepalive 전송
          let elapsedSec = 0
          const keepAliveTimer = setInterval(() => {
            elapsedSec += 15
            send({
              stage: `transcribe_${i + 1}_wait`,
              message: `🎤 음성 전사 중... ${i + 1}/${audioChunks.length}번째 구간 (${elapsedSec}초 경과)`,
              progress: chunkProgress,
            })
          }, 15_000)

          try {
            // ── 다중 제공자 자동 폴백 전사 ──
            const sttKeys = {
              groq: transcriptionProvider !== 'gemini' ? groqKey : undefined,
              deepgram: process.env.DEEPGRAM_API_KEY || undefined,
              azure: (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)
                ? { key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION }
                : undefined,
              openai: process.env.OPENAI_API_KEY || undefined,
              gemini: geminiKey,
            }

            const text = await cascadeTranscribe(
              blob,
              `chunk_${i + 1}_${fileName}`,
              sttKeys,
              (msg) => send({
                stage: `transcribe_${i + 1}_provider`,
                message: `${msg} (${i + 1}/${audioChunks.length}번째 구간)`,
                progress: chunkProgress,
              })
            )
            transcriptions.push(text)
          } catch (e: any) {
            // 청크 전사 실패 → 에러 SSE + 플레이스홀더로 대체
            const errShort = (e.message || '알 수 없는 오류').slice(0, 120)
            send({
              stage: `transcribe_${i + 1}_error`,
              message: `⚠️ 구간 ${i + 1} 전사 실패: ${errShort} — 계속 진행합니다.`,
              progress: chunkProgress,
            })
            console.warn(`[Transcribe] Chunk ${i + 1} failed: ${e.message}`)
            transcriptions.push(`[${i + 1}번째 구간 전사 실패 — 해당 부분 누락]`)
          } finally {
            clearInterval(keepAliveTimer)
          }
        }

        const fullText = transcriptions.join('\n\n')
        const successCount = transcriptions.filter(t => !t.includes('전사 실패 —')).length
        const failedMessages = transcriptions.filter(t => t.includes('전사 실패 —')).join(', ')
        if (successCount === 0) throw new Error(`전사 실패 — 모든 구간에서 음성 인식 불가. 오류: ${failedMessages.slice(0, 200)}`)
        if (successCount < audioChunks.length) {
          send({
            stage: 'partial_warning',
            message: `⚠️ 전사 부분 완료: ${successCount}/${audioChunks.length}개은 성공, 실패 구간은 [누락]로 표시됩니다.`,
            progress: 65,
          })
        }

        const modeLabel = mode === 'detailed' ? '전체 상세' : mode === 'transcript' ? '원문 정리' : '핵심 요약'
        send({
          stage: 'processing',
          message: `🧠 [${modelLabel}] 강의 노트 정리 중... (${modeLabel})`,
          progress: 67,
        })

        let html: string

        if (aiProvider === 'gemini' && geminiKey) {
          const rawHtml = await callGemini(buildGeminiPrompt(mode, fullText, courseContext, compressionRatio), geminiKey, geminiModel)
          // 시각화 마커 → 온디맨드 버튼으로 교체 (신속 - 동기)
          send({ stage: 'visuals', message: '🎨 시각화 버튼 삽입 중...', progress: 93 })
          const withVisuals = processVisuals(rawHtml)
          // YouTube 섹션 추가 (비동기 작업)
          send({ stage: 'youtube', message: '🍞 YouTube 관련 강의 검색 중...', progress: 96 })
          html = await addYouTubeSection(withVisuals, geminiKey)
        } else {
          const wordsPerChunk = mode === 'summary' ? 2000 : 1500
          const textChunks = splitByWords(fullText, wordsPerChunk)

          if (mode === 'detailed') {
            html = await processDetailed(textChunks, groqKey, groqModel, send)
          } else if (mode === 'transcript') {
            html = await processTranscript(textChunks, groqKey, groqModel, send)
          } else {
            html = await processSummary(textChunks, groqKey, groqModel, send)
          }
          // Groq 결과에도 geminiKey가 있으면 시각화 버튼 + YouTube 추가
          if (geminiKey) {
            send({ stage: 'visuals', message: '🎨 시각화 버튼 삽입 중...', progress: 93 })
            const withVisuals = processVisuals(html)
            send({ stage: 'youtube', message: '🍞 YouTube 관련 강의 검색 중...', progress: 96 })
            html = await addYouTubeSection(withVisuals, geminiKey)
          }
        }

        send({
          stage: 'done',
          message: '✅ 완료!',
          progress: 100,
          html,
          fileName,
          fileSizeMB: fileSizeMB.toFixed(1),
          modelUsed: aiProvider === 'gemini' ? geminiModel : groqModel,
        })

      } catch (err: any) {
        send({ stage: 'error', message: err.message || '처리 실패', progress: 0 })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
