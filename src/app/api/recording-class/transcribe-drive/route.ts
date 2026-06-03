import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import ffmpegPath from 'ffmpeg-static'
import { cleanAiRouterText, resolveAiRouterBaseUrl, resolveLocalAiUrl } from '@/lib/ai-router'

export const runtime = 'nodejs'
export const maxDuration = 300
const OPENAI_TEXT_MODEL_DEFAULT = 'gpt-5.1'
const OPENAI_DIRECT_UPLOAD_LIMIT = 20 * 1024 * 1024
const OPENAI_AUDIO_CHUNK_SECONDS = 8 * 60
const SUMMARY_CHUNK_TARGET_CHARS = 8_000
const DIRECT_SUMMARY_MAX_CHARS = 18_000
const TOC_INPUT_MAX_CHARS = 14_000
const GEMINI_TRANSCRIBE_MODELS = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
const LECTURE_SUMMARY_MODEL = 'qwen3:8b'
const LOCAL_LECTURE_AI_LABEL = 'Neuracoust Qwen3 8B 직접 선택'
const execFileAsync = promisify(execFile)

function normalizeOpenAITextModel(model?: string): string {
  const normalized = (model || '').trim()
  if (!normalized || normalized === 'gpt-5.5') return OPENAI_TEXT_MODEL_DEFAULT
  return normalized
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
    wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm',
    flac: 'audio/flac', aac: 'audio/aac',
  }
  return map[ext] || 'audio/mpeg'
}

function requireFfmpegPath(): string {
  if (!ffmpegPath) throw new Error('서버에 ffmpeg 실행 파일이 설치되지 않았습니다.')
  return ffmpegPath
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), `lecture-audio-${randomUUID()}-`))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function getAudioDurationSeconds(inputPath: string): Promise<number> {
  const ffmpeg = requireFfmpegPath()
  try {
    await execFileAsync(ffmpeg, ['-hide_banner', '-i', inputPath], { timeout: 30_000, maxBuffer: 1024 * 1024 })
  } catch (err: any) {
    const output = `${err.stderr || ''}\n${err.stdout || ''}`
    const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!match) throw new Error('오디오 길이를 확인할 수 없습니다.')
    const [, hh, mm, ss] = match
    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss)
  }
  throw new Error('오디오 길이를 확인할 수 없습니다.')
}

async function transcodeAudioSegment(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  durationSeconds: number
): Promise<void> {
  const ffmpeg = requireFfmpegPath()
  await execFileAsync(ffmpeg, [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', String(Math.max(0, Math.floor(startSeconds))),
    '-t', String(Math.ceil(durationSeconds)),
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-b:a', '48k',
    '-f', 'mp3',
    outputPath,
  ], { timeout: 180_000, maxBuffer: 1024 * 1024 })
}

async function downloadFullAudioToTemp(
  drive: ReturnType<typeof getDriveClient>,
  fileId: string,
  dir: string,
  fileName: string
): Promise<string> {
  const dlRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  const inputPath = path.join(dir, `input-${randomUUID()}-${fileName.replace(/[^\w.-]/g, '_') || 'audio'}`)
  await writeFile(inputPath, Buffer.from(dlRes.data as ArrayBuffer))
  return inputPath
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
async function transcribeWithOpenAI(audioBlob: Blob, fileName: string, apiKey: string): Promise<string> {
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

async function resolveOpenAIKey(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'secret_openai_api_key')
    .maybeSingle()

  return (data?.value || process.env.OPENAI_API_KEY || '').trim()
}

async function resolveSettingSecret(
  supabase: Awaited<ReturnType<typeof createClient>>,
  keys: string[],
  envFallbacks: string[] = []
): Promise<string> {
  for (const key of keys) {
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle()
      const value = (data?.value || '').trim()
      if (value) return value
    } catch {}
  }

  for (const envName of envFallbacks) {
    const value = (process.env[envName] || '').trim()
    if (value) return value
  }

  return ''
}

// ── DeepSeek 오디오 전사 (Groq 대안) — 멀티모달 chat API ───────────────
const DEEPSEEK_STT_MODEL_DEFAULT = 'deepseek-v4-flash'
const DEEPSEEK_SAFE_CHUNK = 8 * 1024 * 1024 // 8MB

function audioFormatFromMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'mp3'
}

async function transcribeWithDeepSeek(
  audioBlob: Blob,
  deepseekKey: string,
  model = DEEPSEEK_STT_MODEL_DEFAULT
): Promise<string> {
  const mimeType = audioBlob.type || 'audio/mpeg'
  const format = audioFormatFromMime(mimeType)
  const base64 = Buffer.from(await audioBlob.arrayBuffer()).toString('base64')

  const MAX_RETRIES = 2
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 120_000)
    let res: Response
    try {
      res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: '이 오디오를 한국어로 정확하게 전사해주세요. 말버릇(어, 음, 그니까)은 포함하되 최대한 원본 그대로 출력하세요. 전사 내용만 출력하고 다른 설명은 하지 마세요.' },
              { type: 'input_audio', input_audio: { data: base64, format } },
            ],
          }],
          temperature: 0.1,
          max_tokens: 8192,
        }),
        signal: ctrl.signal,
      })
    } catch (e: unknown) {
      clearTimeout(tid)
      const err = e as Error
      const isAbort = err.name === 'AbortError'
      if (isAbort && attempt < MAX_RETRIES - 1) {
        console.warn(`[DeepSeek STT] 타임아웃 재시도 (${attempt + 1}/${MAX_RETRIES})...`)
        continue
      }
      throw new Error(`DeepSeek 전사 실패 (${isAbort ? '타임아웃' : err.message})`)
    }
    clearTimeout(tid)

    if (!res.ok) {
      const errText = await res.text().catch(() => res.status.toString())
      const isTransient = res.status === 503 || res.status === 429
      if (isTransient && attempt < MAX_RETRIES - 1) {
        console.warn(`[DeepSeek STT] ${res.status} 재시도 (${attempt + 1}/${MAX_RETRIES})...`)
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      throw new Error(`DeepSeek 전사 HTTP ${res.status}: ${errText.slice(0, 200)}`)
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content || ''
    if (!text.trim()) {
      throw new Error('DeepSeek 전사 결과 없음')
    }
    return text.trim()
  }
  throw new Error('DeepSeek 전사 최대 재시도 초과')
}

async function transcribeWithDeepSeekSafe(
  audioBlob: Blob,
  deepseekKey: string,
  model = DEEPSEEK_STT_MODEL_DEFAULT
): Promise<string> {
  if (audioBlob.size <= DEEPSEEK_SAFE_CHUNK) {
    return transcribeWithDeepSeek(audioBlob, deepseekKey, model)
  }
  const results: string[] = []
  for (let offset = 0; offset < audioBlob.size; offset += DEEPSEEK_SAFE_CHUNK) {
    const slice = audioBlob.slice(offset, offset + DEEPSEEK_SAFE_CHUNK, audioBlob.type)
    const text = await transcribeWithDeepSeek(slice, deepseekKey, model)
    results.push(text)
  }
  return results.join('\n')
}

// ── Gemini 오디오 전사 (정리·시각화 등 다른 기능용) — inline_data 방식 ──
async function transcribeWithGemini(audioBlob: Blob, geminiKey: string): Promise<string> {
  const mimeType = audioBlob.type || 'audio/mpeg'
  const arrayBuf = await audioBlob.arrayBuffer()
  const base64 = Buffer.from(arrayBuf).toString('base64')

  const MAX_RETRIES = 2
  for (const model of GEMINI_TRANSCRIBE_MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 120_000) // 2분 타임아웃
      let res: Response
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
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
            signal: ctrl.signal,
          }
        )
      } catch (e: any) {
        clearTimeout(tid)
        const isAbort = e.name === 'AbortError'
        if (isAbort && attempt < MAX_RETRIES - 1) {
          console.warn(`[Gemini:${model}] 타임아웃 재시도 (${attempt + 1}/${MAX_RETRIES})...`)
          continue
        }
        console.warn(`[Gemini:${model}] 전사 실패, 다음 모델 시도: ${isAbort ? '타임아웃' : e.message}`)
        break
      }
      clearTimeout(tid)
      
      if (!res.ok) {
        const errText = await res.text().catch(() => res.status.toString())
        const isTransient = res.status === 503 || res.status === 429
        if (res.status === 404 || errText.includes('quota') || errText.includes('RESOURCE_EXHAUSTED')) {
          console.warn(`[Gemini:${model}] 사용 불가(${res.status}), 다음 모델 시도`)
          break
        }
        if (isTransient && attempt < MAX_RETRIES - 1) {
          console.warn(`[Gemini:${model}] 전사 ${res.status} 재시도 (${attempt + 1}/${MAX_RETRIES})...`)
          await new Promise(r => setTimeout(r, 5000))
          continue
        }
        throw new Error(`Gemini 전사 HTTP ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!text.trim()) {
        const blockReason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '알 수 없음'
        console.warn(`[Gemini:${model}] 전사 결과 없음 (${blockReason}), 다음 모델 시도`)
        break
      }
      return text.trim()
    }
  }
  throw new Error('Gemini 전사 최대 재시도 초과')
}

async function transcribeWithGeminiFileURI(fileUri: string, mimeType: string, apiKey: string): Promise<string> {
  for (const model of GEMINI_TRANSCRIBE_MODELS) {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 180_000) // 3분 타임아웃
    let res: Response
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
          signal: ctrl.signal,
        }
      )
    } catch (e: any) {
      clearTimeout(tid)
      console.warn(`[GeminiFileURI:${model}] 전사 실패, 다음 모델 시도: ${e.name === 'AbortError' ? '타임아웃' : e.message}`)
      continue
    }
    clearTimeout(tid)
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      if (res.status === 404 || errText.includes('quota') || errText.includes('RESOURCE_EXHAUSTED')) {
        console.warn(`[GeminiFileURI:${model}] 사용 불가(${res.status}), 다음 모델 시도`)
        continue
      }
      throw new Error(`Gemini FileURI 전사 실패 ${res.status}: ${errText.slice(0, 100)}`)
    }
    const responseData = await res.json()
    const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text.trim()) continue
    return text.trim()
  }
  throw new Error('Gemini FileURI 전사 실패: 사용 가능한 모델 없음')
}

// ── Gemini File API: 대용량 청크를 업로드 뒤 URI로 전사 (이진 MP3 슬라이스에 안정적) ───
async function uploadToGeminiFileAPI(data: Buffer, mimeType: string, apiKey: string): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 120_000)
    let startRes: Response
    try {
      startRes = await fetch(
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
          signal: ctrl.signal,
        }
      )
    } catch (e: any) {
      clearTimeout(tid)
      throw e
    }
    
    if (!startRes.ok) {
      clearTimeout(tid)
      console.warn('[GeminiFile] Upload start failed:', startRes.status)
      return null
    }
    const uploadUrl = startRes.headers.get('X-Goog-Upload-URL')
    if (!uploadUrl) {
      clearTimeout(tid)
      return null
    }

    let uploadRes: Response
    try {
      uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Length': data.length.toString(),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: new Uint8Array(data),
        signal: ctrl.signal,
      })
    } catch (e: any) {
      clearTimeout(tid)
      throw e
    }
    clearTimeout(tid)
    
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

// ── 로컬/원격 전사: 실패 시 해당 청크를 버리지 않고 다음 제공자로 전환 ────────────────
async function cascadeTranscribe(
  audioBlob: Blob,
  fileName: string,
  keys: {
    groq?: string
    gemma?: { key: string; baseUrl: string }
    deepgram?: string
    azure?: { key: string; region: string }
    deepseek?: { key: string; model: string }
    primaryProvider?: 'deepseek' | 'groq' | 'gemma'
  },
  exhaustedProviders: Set<string>,
  onProviderChange?: (msg: string) => void
): Promise<string> {
  const errors: string[] = []

  if (keys.gemma && !exhaustedProviders.has('gemma')) {
    try {
      onProviderChange?.('🎤 로컬 faster-whisper 전사 중...')
      return await transcribeWithNeuracoustRemote(audioBlob, fileName, keys.gemma.key, keys.gemma.baseUrl)
    } catch (e: unknown) {
      const message = (e as Error)?.message || String(e)
      errors.push(`로컬/Neuracoust 전사: ${message}`)
      if (/quota|429/i.test(message)) exhaustedProviders.add('gemma')
      console.warn('[cascade] 로컬/Neuracoust 전사 실패:', message)
    }
  }

  if (keys.groq && !exhaustedProviders.has('groq')) {
    try {
      onProviderChange?.('🎤 Groq Whisper로 전사 중...')
      return await transcribeChunk(audioBlob, fileName, keys.groq)
    } catch (e: unknown) {
      const message = (e as Error)?.message || String(e)
      errors.push(`Groq Whisper: ${message}`)
      if (/RATE_LIMIT|quota|429/i.test(message)) exhaustedProviders.add('groq')
      console.warn('[cascade] Groq Whisper 실패:', message)
    }
  }

  if (keys.deepseek && !exhaustedProviders.has('deepseek')) {
    try {
      onProviderChange?.('🎤 외부 DeepSeek 전사 중...')
      return await transcribeWithDeepSeekSafe(audioBlob, keys.deepseek.key, keys.deepseek.model)
    } catch (e: unknown) {
      const message = (e as Error)?.message || String(e)
      errors.push(`외부 DeepSeek: ${message}`)
      if (/quota|429/i.test(message)) exhaustedProviders.add('deepseek')
      console.warn('[cascade] 외부 DeepSeek 전사 실패:', message)
    }
  }

  throw new Error(`전사 가능한 API가 모두 실패했습니다. ${errors.join(' / ') || 'API 키 설정을 확인하세요.'}`)
}

function resolveRemoteTranscribeUrls(baseUrl?: string): string[] {
  const base = resolveAiRouterBaseUrl(baseUrl)
  if (base.endsWith('/api/remote/v1/transcribe')) return [base]
  if (base.endsWith('/api/local-ai/stt/transcribe')) return [base]
  if (base.endsWith('/api/remote/v1')) {
    return [
      resolveLocalAiUrl(base, 'stt/transcribe'),
      `${base}/transcribe`,
      `${base}/stt`,
      `${base}/audio/transcriptions`,
    ]
  }
  return [
    resolveLocalAiUrl(base, 'stt/transcribe'),
    `${base}/api/remote/v1/transcribe`,
    `${base}/api/remote/v1/stt`,
    `${base}/api/remote/v1/audio/transcriptions`,
    `${base}/api/gemma/v1/audio/transcriptions`,
  ]
}

function extractRemoteTranscription(data: any): string {
  const direct = [
    data?.text,
    data?.transcript,
    data?.transcription,
    data?.content,
    data?.data?.text,
    data?.data?.transcript,
    data?.data?.transcription,
    data?.result?.text,
    data?.result?.transcript,
  ].find(value => typeof value === 'string' && value.trim())

  if (direct) return direct.trim()

  if (Array.isArray(data?.segments)) {
    return data.segments.map((segment: any) => segment?.text || '').join(' ').trim()
  }
  if (Array.isArray(data?.data?.segments)) {
    return data.data.segments.map((segment: any) => segment?.text || '').join(' ').trim()
  }

  return ''
}

async function transcribeWithNeuracoustRemote(audioBlob: Blob, fileName: string, gemmaKey: string, baseUrl: string): Promise<string> {
  const urls = resolveRemoteTranscribeUrls(baseUrl)
  const errors: string[] = []

  for (const url of urls) {
    const form = new FormData()
    form.append('file', audioBlob, fileName)
    form.append('language', 'ko')
    form.append('responseFormat', 'json')

    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 180_000)
    try {
      const headers: Record<string, string> = {}
      if (gemmaKey) {
        headers.Authorization = `Bearer ${gemmaKey}`
        headers['x-api-key'] = gemmaKey
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: form,
        signal: ctrl.signal,
      })
      clearTimeout(tid)

      if (!res.ok) {
        const err = await res.text().catch(() => '')
        errors.push(`${url} ${res.status}: ${err.slice(0, 160)}`)
        continue
      }

      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('text/plain')) {
        const text = (await res.text()).trim()
        if (text) return text
      }

      const data = await res.json()
      if (data?.ok === false) {
        const code = data?.error?.code ? `${data.error.code}: ` : ''
        errors.push(`${url}: ${code}${data?.error?.message || 'unknown error'}`)
        continue
      }

      const text = extractRemoteTranscription(data)
      if (text) return text
      errors.push(`${url}: 전사 텍스트 없음`)
    } catch (e: unknown) {
      clearTimeout(tid)
      const message = e instanceof Error ? e.message : String(e)
      errors.push(`${url}: ${message}`)
    }
  }

  const hasOnly404 = errors.length > 0 && errors.every(error => /\s404:/.test(error))
  if (hasOnly404) {
    throw new Error(`Neuracoust/Gemma 전사 엔드포인트가 아직 열려 있지 않습니다. 확인한 경로: ${urls.join(', ')}`)
  }
  throw new Error(`Neuracoust/Gemma 전사 실패: ${errors.join(' / ') || '응답 없음'}`)
}

// ── 마크다운 → HTML 변환 (Gemini가 HTML 대신 마크다운 응답 시 폴백) ──────────────────
function markdownToHtml(text: string): string {
  let html = text
  
  // 마크다운 문법이 명확히 존재하는지 확인
  const hasMarkdown = /(?:^|<p[^>]*>|<br\s*\/?>|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s)|(\*\*|```|\\[a-zA-Z]+|\$(?!\s)[^$\n]+(?<!\s)\$)/m.test(html)
  
  if (!hasMarkdown) {
    // 마크다운이 없고 완벽한 HTML이면 그대로 반환
    if (/<(h[1-6]|p|ul|ol|li|div|strong|em|br|table|blockquote)\b/i.test(html)) return html
    
    // 일반 텍스트 → 줄바꿈을 <p>로 감싸기
    return html.split(/\n{2,}/).map(para => {
      const line = para.trim()
      if (!line) return ''
      return '<p>' + line.replace(/\n/g, '<br/>') + '</p>'
    }).filter(Boolean).join('\n')
  }

  // 마크다운 문법이 있으면 (태그가 섞여있어도) 변환 수행
  // Math & LaTeX basic replacements
  html = html.replace(/\\(?:rightarrow|Rightarrow|to|go|rarr)/g, '→')
  html = html.replace(/\\(?:leftarrow|Leftarrow|larr)/g, '←')
  html = html.replace(/\\(?:leftrightarrow|Leftrightarrow|harr)/g, '↔')
  html = html.replace(/\\lambda/g, 'λ')
  html = html.replace(/\\mu/g, 'μ')
  html = html.replace(/\\pi/g, 'π')
  html = html.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
  
  // Inline Math: $...$ -> <em>...</em> (공백 없는 $ 만 매칭하여 다른 $ 표기 보호)
  html = html.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, '<em>$1</em>')

  // code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  
  // headings
  html = html.replace(/(?:^|(?:<p[^>]*>)|(?:<div[^>]*>)|(?:<br\s*\/?>)|\n)\s*#{4}\s+([^<\n]+)/gm, '<h4>$1</h4>')
  html = html.replace(/(?:^|(?:<p[^>]*>)|(?:<div[^>]*>)|(?:<br\s*\/?>)|\n)\s*#{3}\s+([^<\n]+)/gm, '<h3>$1</h3>')
  html = html.replace(/(?:^|(?:<p[^>]*>)|(?:<div[^>]*>)|(?:<br\s*\/?>)|\n)\s*#{2}\s+([^<\n]+)/gm, '<h2>$1</h2>')
  html = html.replace(/(?:^|(?:<p[^>]*>)|(?:<div[^>]*>)|(?:<br\s*\/?>)|\n)\s*#{1}\s+([^<\n]+)/gm, '<h1>$1</h1>')
  
  // bold/italic (태그 안 건드리는 새로운 방식 & 줄바꿈 지원)
  html = html.replace(/(<[^>]+>)|(\*\*\*([\s\S]+?)\*\*\*)/g, (m, tag, md, c) => tag ? tag : '<strong><em>'+c+'</em></strong>')
  html = html.replace(/(<[^>]+>)|(\*\*([\s\S]+?)\*\*)/g, (m, tag, md, c) => tag ? tag : '<strong>'+c+'</strong>')
  html = html.replace(/(<[^>]+>)|(\*([\s\S]+?)\*)/g, (m, tag, md, c) => tag ? tag : '<em>'+c+'</em>')
  
  // superscript references like [1]
  html = html.replace(/\[(\d+)\]/g, '<sup>[$1]</sup>')
  
  // unordered list
  html = html.replace(/(^|\n|<br\s*\/?>|<div>|<p>)[ \t]*[-*+] (.+?(?:\n[ \t]*[-*+] .+)*)/g, (match, prefix) => {
    const raw = match.replace(/^(?:\n|<br\s*\/?>|<div>|<p>)/, '')
    const items = raw.split(/\n|<br\s*\/?>/).filter(l => l.trim().match(/^[-*+]/)).map(line =>
      '<li>' + line.replace(/^[ \t]*[-*+] /, '') + '</li>'
    ).join('')
    return prefix + '<ul>' + items + '</ul>'
  })
  
  // ordered list
  html = html.replace(/(^|\n|<br\s*\/?>|<div>|<p>)[ \t]*\d+\. (.+?(?:\n[ \t]*\d+\. .+)*)/g, (match, prefix) => {
    const raw = match.replace(/^(?:\n|<br\s*\/?>|<div>|<p>)/, '')
    const items = raw.split(/\n|<br\s*\/?>/).filter(l => l.trim().match(/^\d+\./)).map(line =>
      '<li>' + line.replace(/^[ \t]*\d+\. /, '') + '</li>'
    ).join('')
    return prefix + '<ol>' + items + '</ol>'
  })
  
  // horizontal rule
  html = html.replace(/^(?:<p>)?---+?(?:<\/p>)?$/gm, '<hr/>')
  
  // paragraphs: wrap consecutive non-tag lines (that don't start with < )
  html = html.replace(/^(?!<[a-zA-Z\/])([^<\n].*)$/gm, '<p>$1</p>')
  
  // clean up empty p tags before heading
  html = html.replace(/<p><\/p>\s*<h/g, '<h')
  
  // clean up blank lines
  html = html.replace(/\n{3,}/g, '\n\n').trim()
  return html
}

function normalizeDocumentStructure(html: string): string {
  const splitPackedNumberedParagraphs = (input: string) => input.replace(/<p>\s*([\s\S]*?)\s*<\/p>/gi, (match, inner) => {
    const markerPattern = /(?:^|\s)(?:<(?:strong|b)>)?\s*\d+\.\s+(?!\d)/gi
    const markerCount = (inner.match(markerPattern) || []).length
    const startsLikeNumberedSection = /^\s*(?:<(?:strong|b)>)?\s*\d+\.\s+(?!\d)/i.test(inner)
    if (markerCount < 2 && !startsLikeNumberedSection) return match

    const packed = inner.replace(/\s+((?:<(?:strong|b)>)?\s*\d+\.\s+(?!\d))/gi, '\n$1')
    const parts = packed.split(/\n+/).map((part: string) => part.trim()).filter(Boolean)
    if (parts.length === 0) return match

    return parts.map((part: string) => {
      const strongHeadingMatch = part.match(/^(\d+\.\s*)?<(strong|b)>([\s\S]{3,180}?)<\/\2>\s*([\s\S]*)$/i)
      const sectionMatch = strongHeadingMatch
        ? null
        : part.match(/^((?:<(?:strong|b)>)?\s*\d+\.\s+[\s\S]{3,160}?[:：])\s*([\s\S]*)$/i)
      if (!strongHeadingMatch && !sectionMatch) return `<p>${part}</p>`

      const heading = strongHeadingMatch
        ? `${strongHeadingMatch[1] || ''}${strongHeadingMatch[3]}`.trim()
        : sectionMatch![1]
            .replace(/^<(strong|b)>/i, '')
            .replace(/<\/(strong|b)>$/i, '')
            .trim()
      const body = (strongHeadingMatch ? strongHeadingMatch[4] : sectionMatch![2])?.trim()
      return `<h2>${heading}</h2>${body ? `\n<p>${body}</p>` : ''}`
    }).join('\n')
  })

  const headingText = '([^<]{3,180})'
  const bareNumberedTitle = new RegExp(`<p>\\s*((?:<strong>|<b>)?\\s*\\d+\\.\\s+${headingText}(?:</strong>|</b>)?)\\s*</p>`, 'gi')
  const decimalSubTitle = new RegExp(`<p>\\s*((?:<strong>|<b>)?\\s*\\d+\\.\\d+(?:\\.\\d+)?\\s+${headingText}(?:</strong>|</b>)?)\\s*</p>`, 'gi')

  return splitPackedNumberedParagraphs(html)
    .replace(/<h2>\s*((?:<strong>|<b>)?\s*\d+\.\d+(?:\.\d+)?\s+[^<]{3,180}(?:<\/strong>|<\/b>)?)\s*<\/h2>/gi, '<h3>$1</h3>')
    .replace(/<h3>\s*((?:<strong>|<b>)?\s*\d+\.\s+[^<]{3,180}(?:<\/strong>|<\/b>)?)\s*<\/h3>/gi, '<h2>$1</h2>')
    .replace(decimalSubTitle, '<h3>$1</h3>')
    .replace(bareNumberedTitle, '<h2>$1</h2>')
    .replace(/<h([23])>\s*<(strong|b)>\s*/gi, '<h$1>')
    .replace(/\s*<\/(strong|b)>\s*<\/h([23])>/gi, '</h$2>')
}

// ── Groq 텍스트 생성 (자동 재시도) ─────────────────────────────
async function callGroq(
  systemPrompt: string,
  userContent: string,
  groqKey: string,
  model = 'llama-3.1-8b-instant',
  maxTokens = 1000
): Promise<string> {
  const MAX_RETRIES = 3
  const TIMEOUT_MS = 45_000 // 45초 타임아웃 (300초 Vercel 한도 고려)

  let currentContent = userContent

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: systemPrompt
            ? [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: currentContent },
              ]
            : [{ role: 'user', content: currentContent }],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
        signal: ctrl.signal,
      })
    } catch (fetchErr: any) {
      clearTimeout(tid)
      const isAbort = fetchErr?.name === 'AbortError'
      console.warn(`[Groq:${model}] fetch ${isAbort ? '120s 타임아웃' : fetchErr?.message}, 재시도 ${attempt + 1}/${MAX_RETRIES}`)
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      throw new Error(`Groq 연결 실패 (${isAbort ? '타임아웃' : fetchErr?.message})`)
    }
    clearTimeout(tid)

    // 에러 본문을 status 분기 전에 미리 읽어두기
    const errText = res.ok ? '' : await res.text()

    if (res.status === 413 || (res.status === 400 && (errText.includes('too large') || errText.includes('maximum context length')))) {
      console.warn(`[${model}] Request too large (413/400). Truncating content and retrying...`)
      currentContent = currentContent.slice(0, Math.floor(currentContent.length * 0.5)) + '\n\n... (길이 제한으로 생략)'
      continue
    }

    if (res.status === 429) {
      // 429는 Rate Limit 이므로 대기해야 함
      const match = errText.match(/try again in (\d+(?:\.\d+)?)s/i)
      const waitSec = match ? Math.min(Math.ceil(parseFloat(match[1])) + 1, 15) : 10
      console.log(`[${model}] Rate limited. Waiting ${waitSec}s (retry ${attempt + 1}/${MAX_RETRIES})...`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
      continue
    }
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${errText}`)
    const data = await res.json()
    let text = data?.choices?.[0]?.message?.content || ''
    text = text.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    // Gemini와 동일하게: 마크다운으로 응답한 경우 HTML로 변환
    return markdownToHtml(text)
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
    'gemini-3.1-pro-preview': ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview'],
    'gemini-2.5-pro':   ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
    'gemini-2.0-flash': ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    'gemini-1.5-flash': ['gemini-1.5-flash', 'gemini-2.0-flash'],
    'gemini-1.5-pro':   ['gemini-1.5-pro', 'gemini-2.0-flash'],
  }
  const models = fallbacks[preferredModel] || [preferredModel, 'gemini-2.0-flash']

  for (const model of models) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 60_000) // 60초 타임아웃 (Vercel 300초 한도 고려)
      let res: Response
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
            }),
            signal: ctrl.signal,
          }
        )
      } catch (fetchErr: unknown) {
        clearTimeout(tid)
        const isAbort = (fetchErr as Error)?.name === 'AbortError'
        console.warn(`[Gemini:${model}] fetch ${isAbort ? '타임아웃' : (fetchErr as Error)?.message}, 다음 모델 시도...`)
        break // move to next model
      }
      clearTimeout(tid)
      if (res.status === 429 || res.status === 503) {
        const waitSec = attempt === 0 ? 15 : 25
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
        // 마크다운으로 응답한 경우 HTML로 변환
        return markdownToHtml(text)
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

function resolveGemmaChatUrl(baseUrl?: string): string {
  const base = (baseUrl || process.env.GEMMA_BASE_URL || 'https://neuracoust.tplinkdns.com').trim().replace(/\/$/, '')
  if (base.endsWith('/chat/completions')) return base
  if (base.endsWith('/api/gemma/v1')) return `${base}/chat/completions`
  return `${base}/api/gemma/v1/chat/completions`
}

function cleanGeneratedText(text: string): string {
  return cleanAiRouterText(text)
}

async function callGemma(
  systemPrompt: string,
  userContent: string,
  gemmaKey: string,
  model = process.env.GEMMA_MODEL || 'gemma4:e4b',
  maxTokens = 8192,
  timeoutMs = 50_000,
  baseUrl?: string
): Promise<string> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const finalSystemPrompt = [
      systemPrompt,
      model === 'deepseek-r1'
        ? '한국어로 최종 답변만 작성하세요. 숨은 추론, chain-of-thought, <think> 블록은 절대 출력하지 마세요.'
        : '',
    ].filter(Boolean).join('\n\n')
    const messages = finalSystemPrompt
      ? [{ role: 'system', content: finalSystemPrompt }, { role: 'user', content: userContent }]
      : [{ role: 'user', content: userContent }]
    const res = await fetch(resolveGemmaChatUrl(baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${gemmaKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(tid)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Gemma error ${res.status}: ${errText.slice(0, 300)}`)
    }

    const data = await res.json()
    const text = cleanGeneratedText(data?.choices?.[0]?.message?.content || '')
    if (!text) throw new Error(`${model} returned empty response`)
    return markdownToHtml(text)
  } catch (e: any) {
    clearTimeout(tid)
    const timeoutSec = Math.round(timeoutMs / 1000)
    throw new Error(`${model} 연결 실패 (${e.name === 'AbortError' ? `${timeoutSec}초 타임아웃` : e.message})`)
  }
}

// ── DeepSeek 텍스트 생성 (자동 재시도 + 타임아웃) ─────────────────────────────
async function callDeepSeek(
  systemPrompt: string,
  userContent: string,
  deepseekKey: string,
  model = 'deepseek-v4-flash',
  maxTokens = 8192
): Promise<string> {
  const MAX_RETRIES = 2 // 재시도 4→2: Vercel 300초 한도 보호
  const TIMEOUT_MS = 60_000 // 60초 타임아웃 (120→60s)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
        signal: ctrl.signal,
      })
    } catch (fetchErr: any) {
      clearTimeout(tid)
      const isAbort = fetchErr?.name === 'AbortError'
      console.warn(`[DeepSeek:${model}] fetch ${isAbort ? '120s 타임아웃' : fetchErr?.message}, 재시도 ${attempt + 1}/${MAX_RETRIES}`)
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      throw new Error(`DeepSeek 연결 실패 (${isAbort ? '타임아웃' : fetchErr?.message})`)
    }
    clearTimeout(tid)

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after')
      const waitSec = retryAfter ? parseInt(retryAfter) + 2 : 15
      console.log(`[${model}] Rate limited. Waiting ${waitSec}s (retry ${attempt + 1}/${MAX_RETRIES})...`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
      continue
    }
    if (res.status === 503 || res.status === 502) {
      console.warn(`[DeepSeek] ${res.status} 서버 오류, 5초 후 재시도...`)
      await new Promise(r => setTimeout(r, 5000))
      continue
    }
    if (!res.ok) throw new Error(`DeepSeek error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const text = cleanGeneratedText(data?.choices?.[0]?.message?.content || '')
    return markdownToHtml(text)
  }
  throw new Error(`${model}: 최대 재시도 횟수 초과. DeepSeek API 한도 도달.`)
}

async function callTextModel(systemPrompt: string, userContent: string, provider: string, apiKey: string, model: string): Promise<string> {
  const errors: string[] = []
  const remoteKey = provider === 'gemma' ? apiKey : (process.env.AI_ROUTER_API_KEY || process.env.REMOTE_API_KEY || process.env.GEMMA_API_KEY || '')
  const groqKey = provider === 'groq' ? apiKey : (process.env.GROQ_API_KEY || '')
  const externalDeepseekKey = provider === 'deepseek' ? apiKey : (process.env.DEEPSEEK_API_KEY || '')
  const attempts: Array<{ label: string; run: () => Promise<string> }> = []
  const addAttempt = (label: string, run: () => Promise<string>) => {
    if (!attempts.some(attempt => attempt.label === label)) attempts.push({ label, run })
  }

  if (provider === 'gemma' && remoteKey) {
    const directModel = model && model !== 'auto' ? model : LECTURE_SUMMARY_MODEL
    addAttempt(`Neuracoust ${directModel}`, () => callGemma(systemPrompt, userContent, remoteKey, directModel, 4096, 50_000))
  } else if (provider === 'groq' && groqKey) {
    addAttempt('Groq', () => callGroq(systemPrompt, userContent, groqKey, model || 'llama-3.1-8b-instant', 4096))
  } else if (provider === 'deepseek' && externalDeepseekKey) {
    addAttempt('외부 DeepSeek', () => callDeepSeek(systemPrompt, userContent, externalDeepseekKey, model || 'deepseek-chat', 4096))
  }

  if (provider !== 'gemma' && groqKey) {
    addAttempt('Groq', () => callGroq(systemPrompt, userContent, groqKey, 'llama-3.1-8b-instant', 4096))
  }
  if (provider !== 'gemma' && externalDeepseekKey) {
    addAttempt('외부 DeepSeek', () => callDeepSeek(systemPrompt, userContent, externalDeepseekKey, 'deepseek-chat', 4096))
  }

  for (const attempt of attempts) {
    try {
      return await attempt.run()
    } catch (err: unknown) {
      const message = (err as Error)?.message || String(err)
      errors.push(`${attempt.label}: ${message}`)
      console.warn(`[callTextModel] ${attempt.label} text failed, trying fallback:`, message)
    }
  }

  throw new Error(`AI 정리 API가 모두 실패했습니다. ${errors.map(e => e.slice(0, 220)).join(' / ') || 'Neuracoust 직접 모델/Groq/외부 DeepSeek API 키 설정을 확인하세요.'}`)
}

async function callOpenAI(
  systemPrompt: string,
  userContent: string,
  openaiKey: string,
  model = OPENAI_TEXT_MODEL_DEFAULT,
  maxTokens = 16384,
  timeoutMs = 260_000
): Promise<string> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const requestModel = normalizeOpenAITextModel(model)
    const isGpt5 = requestModel.startsWith('gpt-5')
    const messages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }]
      : [{ role: 'user', content: userContent }]
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: requestModel,
        messages,
        ...(isGpt5 ? { max_completion_tokens: maxTokens } : { temperature: 0.2, max_tokens: maxTokens }),
      }),
      signal: ctrl.signal,
    })
    clearTimeout(tid)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 300)}`)
    }
    const data = await res.json()
    let text = data?.choices?.[0]?.message?.content || ''
    text = text.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return markdownToHtml(text)
  } catch (e: any) {
    clearTimeout(tid)
    const timeoutSec = Math.round(timeoutMs / 1000)
    throw new Error(`OpenAI 연결 실패 (${e.name === 'AbortError' ? `${timeoutSec}초 타임아웃` : e.message})`)
  }
}

// ── DETAILED 모드: 긴 강의 구간별 교재형 정리 ─────────────────────────
const SCRIBE_SYSTEM = `당신은 전공 서적을 집필하는 전문 학술 작가(Academic Author)입니다.
입력된 강의 전사 텍스트를 학생들이 복습할 수 있는 완성도 높은 "교재형 강의 노트"로 재구성하세요.

[핵심 목표]
- 단순 전사, 회의록, 대화문, 자막식 문장 금지.
- 구어체와 말버릇("어", "음", "그니까", "뭐")을 제거하고 자연스러운 문어체로 변환.
- 강의의 개념, 원리, 예시, 실무적 의미를 논리적 순서로 묶어 설명.
- 교수자의 사적인 잡담이나 수업 운영 멘트는 제거.
- 중요한 예시와 비유는 "실무 예시" 또는 본문 설명으로 세련되게 녹여내기.
- 명백히 부족한 설명은 전공 지식으로 짧게 보완하되, 강의와 무관한 새 주제를 만들지 않기.

[구조]
- 이 구간의 대표 소제목을 <h2>로 작성.
- 하위 개념은 <h3>로 나누기.
- 본문은 <p>로 충분히 설명.
- 번호가 붙은 항목은 반드시 각각 독립된 <h2> 또는 <h3> 블록으로 분리하고, 한 <p> 안에 "1. ... 2. ... 3. ..."처럼 여러 항목을 이어 쓰지 않기.
- 제목과 본문을 같은 줄에 붙이지 말고, 제목 태그를 닫은 뒤 별도 <p>로 본문 작성.
- 핵심 개념은 <div class="concept-note"><h4>📌 핵심 개념</h4><p>...</p></div> 형태 사용 가능.
- 실무 사례는 <div class="case-study"><h4>💡 실무 예시</h4><p>...</p></div> 형태 사용 가능.

[출력 형식]
순수 HTML. html/head/body 태그 없음. 코드 블록 없음.
마크다운 번호 목록으로 큰 섹션을 만들지 말고, 섹션 제목은 반드시 h2/h3 태그를 사용.
<h2>구간 주제</h2>
<p>교재형 본문...</p>
<h3>하위 개념</h3>
<p>설명...</p>`

async function processDetailed(
  textChunks: string[], provider: string, apiKey: string, model: string, send: (d: Record<string, unknown>) => void
): Promise<string> {
  // 긴 강의 정리는 요청당 입력이 커서 순차 처리로 rate limit/일시 실패를 줄인다.
  const PARALLEL = 1
  const sections: string[] = new Array(textChunks.length).fill('')
  const errors: string[] = []

  for (let batchStart = 0; batchStart < textChunks.length; batchStart += PARALLEL) {
    const batchEnd = Math.min(batchStart + PARALLEL, textChunks.length)
    const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k)

    await Promise.all(batchIndices.map(async (i) => {
      send({
        stage: `scribe_${i + 1}`,
        message: `✍️ 강의 내용 정서 중... ${i + 1}/${textChunks.length}번째 구간`,
        progress: 67 + Math.floor((i / textChunks.length) * 25),
      })
      try {
        const result = await callTextModel(SCRIBE_SYSTEM, `아래 강의 전사 텍스트를 정서하세요:\n\n${textChunks[i]}`, provider, apiKey, model)
        sections[i] = result
      } catch (err: any) {
        console.error(`[processDetailed] 청크 ${i + 1} 실패:`, err?.message)
        errors[i] = err?.message || '알 수 없는 오류'
        sections[i] = ''
      }
    }))

    // 배치 사이 짧은 대기로 rate limit 방지
    if (batchStart + PARALLEL < textChunks.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  const failedCount = sections.filter(section => !section.trim()).length
  if (failedCount === sections.length) {
    const detail = errors.filter(Boolean).map(e => e.slice(0, 160)).join(' / ')
    send({
      stage: 'fallback_summary',
      message: `⚠️ AI 정리 모델이 응답하지 않아 전사 원문 기반 임시 노트를 생성합니다.${detail ? ` (${detail.slice(0, 80)})` : ''}`,
      progress: 90,
    })
    return buildTranscriptFallbackHtml(textChunks.join('\n\n'), '전체 상세 노트')
  }

  send({ stage: 'toc', message: '📑 목차와 핵심 정리 구성 중...', progress: 93 })

  const { header, footer } = buildLocalLectureOutline(sections)
  return header + '\n\n' + sections.filter(Boolean).join('\n\n') + '\n\n' + footer
}

// ── SUMMARY 모드 (MapReduce) ─────────────────────────────────────
async function processSummary(
  textChunks: string[], provider: string, apiKey: string, model: string, send: (d: Record<string, unknown>) => void
): Promise<string> {
  const MAP_SYSTEM = `이 강의 섹션에서 핵심 개념과 중요 포인트만 추출하세요.
번호가 붙은 큰 주제는 각각 별도 <h3> 또는 <h2>로 분리하고, 한 문단 안에 여러 번호 주제를 이어 쓰지 마세요.
대화형 안내 문장이나 질문 유도 문장은 삭제하세요.
출력: 순수 HTML. <h3>주제</h3><ul><li><strong>개념</strong>: 설명</li></ul>`

  const PARALLEL = 1
  const summaries: string[] = new Array(textChunks.length).fill('')

  for (let batchStart = 0; batchStart < textChunks.length; batchStart += PARALLEL) {
    const batchEnd = Math.min(batchStart + PARALLEL, textChunks.length)
    const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k)

    await Promise.all(batchIndices.map(async (i) => {
      send({
        stage: `map_${i + 1}`,
        message: `🔍 핵심 추출 중... ${i + 1}/${textChunks.length}번째`,
        progress: 67 + Math.floor((i / textChunks.length) * 20),
      })
      try {
        const s = await callTextModel(MAP_SYSTEM, textChunks[i], provider, apiKey, model)
        summaries[i] = s
      } catch (err: any) {
        console.error(`[processSummary] 청크 ${i + 1} 실패, 스킵:`, err?.message)
        summaries[i] = ''
      }
    }))

    if (batchStart + PARALLEL < textChunks.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  send({ stage: 'reduce', message: '📝 최종 요약 통합 중...', progress: 88 })

  if (!summaries.some(summary => summary.trim())) {
    send({ stage: 'fallback_summary', message: '⚠️ AI 핵심 추출이 실패해 전사 원문 기반 임시 요약을 생성합니다.', progress: 90 })
    return buildTranscriptFallbackHtml(textChunks.join('\n\n'), '강의 요약')
  }

  const REDUCE_SYSTEM = `여러 강의 섹션의 핵심 내용을 하나의 완성된 강의 요약 노트로 통합하세요.
중복 제거하고 논리적으로 재구성하세요. 번호가 붙은 큰 주제는 각각 별도 <h2>로 분리하고, 한 문단 안에 여러 번호 주제를 이어 쓰지 마세요. 대화형 마무리 문장은 금지합니다. 출력: 순수 HTML.
<h1>📚 강의 요약</h1><p>2~3문장 개요</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 주요 내용</h2><h3>소주제</h3><p>설명</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>`

  let reduceInput = summaries.join('\n\n')
  // Groq TPM 한도를 위해 요약 통합 시 입력 제한
  if (provider === 'groq' && reduceInput.length > 4000) {
    reduceInput = reduceInput.slice(0, 4000) + '\n\n... (이하 생략)'
  }

  return await callTextModel(REDUCE_SYSTEM, reduceInput, provider, apiKey, model)
}

// ── TRANSCRIPT 모드 (최소 정제) ──────────────────────────────────
async function processTranscript(
  textChunks: string[], provider: string, apiKey: string, model: string, send: (d: Record<string, unknown>) => void
): Promise<string> {
  const SYSTEM = `강의 전사 텍스트의 말버릇("어", "음", "그니까", "저", "뭐")과 완전한 문장이 아닌 반복만 제거하세요.
내용은 95% 이상 그대로 유지. 문어체로 변환. 문단 구분 추가.
번호가 붙은 주제는 각각 <h2>로 분리하고, 한 <p> 안에 여러 번호 주제를 이어 쓰지 마세요. 대화형 안내 문장과 질문 유도 문장은 삭제하세요.
출력: 순수 HTML. <h2>주제</h2><p>정제된 내용</p>`

  const PARALLEL = 1
  const sections: string[] = new Array(textChunks.length).fill('')

  for (let batchStart = 0; batchStart < textChunks.length; batchStart += PARALLEL) {
    const batchEnd = Math.min(batchStart + PARALLEL, textChunks.length)
    const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k)

    await Promise.all(batchIndices.map(async (i) => {
      send({
        stage: `clean_${i + 1}`,
        message: `🧹 텍스트 정제 중... ${i + 1}/${textChunks.length}번째`,
        progress: 67 + Math.floor((i / textChunks.length) * 28),
      })
      try {
        const s = await callTextModel(SYSTEM, textChunks[i], provider, apiKey, model)
        sections[i] = s
      } catch (err: any) {
        console.error(`[processTranscript] 청크 ${i + 1} 실패, 원본으로 대체:`, err?.message)
        sections[i] = `<p>${textChunks[i].replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      }
    }))

    if (batchStart + PARALLEL < textChunks.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
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
    detailed: `당신은 전공 서적을 집필하는 전문 학술 작가(Academic Author)입니다. 제공된 강의 전사 텍스트를 바탕으로, 학생과 교수가 학기말에 소책자로 묶어 활용할 수 있는 완성도 높은 "교과서(Textbook)" 단원을 작성하세요.
${COMPRESSION_INSTRUCTION}
[제목 계층 규칙 — 매우 중요]
- 문서의 최상위 단원명은 <h1>로 1번만 작성하세요.
- "1. 제목", "2. 제목", "3. 제목"처럼 한 자리 번호와 점으로 시작하는 큰 단락은 반드시 <h2>로 작성하세요. 절대 <p>, <strong>, 목록 항목으로 쓰지 마세요.
- "1.1 제목", "1.2 제목", "2.1 제목"처럼 소수 번호로 시작하는 하위 단락은 반드시 <h3>로 작성하세요.
- 번호가 붙은 제목 바로 아래에는 본문 <p>를 이어서 작성하세요.
- 한 문단 안에 "1. 기술적인 내용 ... 2. 프로젝트 진행 상황 ... 3. 팀원의 이야기 ..."처럼 여러 번호 단락을 절대 이어 쓰지 마세요. 각 번호는 반드시 줄과 태그가 분리된 별도 섹션이어야 합니다.
- "기술적인 내용", "프로젝트 진행 상황", "개인적인 이야기", "기타 내용"처럼 성격이 다른 내용은 각각 독립된 <h2> 섹션으로 나누세요.
[절대 금지]
- "교수님이 말씀하셨다", "오늘 우리가 배울 내용은"과 같은 3인칭 관찰자 시점 및 강의실 구어체 서술 절대 금지
- 단순한 녹취록 요약 형식 금지
- 강의와 무관한 교수의 지극히 사적인 잡담이나 개인적인 내용 포함 금지
- "더 궁금하면 질문해주세요", "도움이 필요하면 알려주세요", "정리해드리겠습니다" 같은 AI 챗봇식 안내 문장 금지
- "corners입니다"처럼 전사 오류로 보이는 불완전한 단어·문장만 단독으로 남기지 말고 문맥상 교정하거나 삭제

[작성 및 교정 지침]
- 구어체를 격식 있고 자연스러운 전공 서적 문어체(교과서 본문 스타일)로 완벽히 변환하세요.
- 강의 내용 중 명백하게 잘못된 정보나 사실 오류가 있다면 올바른 학술적 사실로 자체 교정하여 서술하세요.
- 논리적 비약이 있거나 개념 설명이 부족한 부분은 독자의 이해를 돕기 위해 필요한 전공 지식을 자연스럽게 추가하여 보완하세요.
- 교수님이 든 중요한 학술적 예시나 비유는 교과서의 '심화 학습'이나 '실무 사례' 박스 형태로 세련되게 녹여내고, 사적인 농담이나 잡담은 과감히 생략하세요.
- 전체적인 논리적 흐름에 따라 챕터 제목과 소제목을 구조화하여 작성하세요.
${VISUAL_INSTRUCTIONS}
${REFERENCE_INSTRUCTIONS}
${CONTEXT_BLOCK}
[출력 형식] 순수 HTML. html/head/body 태그 없음.
각 섹션은 반드시 아래처럼 제목 태그와 본문 태그를 분리하세요.
<h1>📚 [단원 주제]</h1>
<div class="chapter-intro"><p>단원 개요 및 학습 목표 (강의 내용을 바탕으로 학술적으로 재구성)</p></div>
<h2>1. 섹션 제목</h2>
<h3>1.1 소주제</h3>
<p>교과서 본문 내용...</p>
<div class="case-study"><h4>💡 실무 사례 및 예시</h4><p>내용</p></div>
<div class="concept-note"><h4>📌 핵심 개념</h4><p>추가된 설명 및 교정된 내용</p></div>
<h2>✅ 단원 핵심 정리</h2>
<ul><li>핵심 포인트</li></ul>

강의 전사:
${fullText}`,

    summary: `당신은 전공 서적을 집필하는 전문 학술 작가(Academic Author)입니다. 제공된 강의 전사 텍스트에서 핵심 개념과 중요 포인트를 추출하여, 교과서의 "단원 요약(Chapter Summary)" 노트를 작성하세요.
${VISUAL_INSTRUCTIONS}
${CONTEXT_BLOCK}
[작성 지침]
- "교수님이 설명했다" 같은 구어체, 관찰자 시점 절대 금지. 정제된 교과서 문장으로 서술.
- 오류 교정 및 부족한 개념 보완 필수.
- 강의와 무관한 사적인 잡담 생략.
- 번호가 붙은 큰 주제는 각각 <h2>로 분리하고, 한 문단 안에 여러 번호 주제를 이어 쓰지 마세요.
- 대화형 마무리 문장이나 질문 유도 문장 금지.
출력: 순수 HTML. html/head/body 태그 없음.
<h1>📚 단원 요약 노트</h1>
<p>2~3문장 개요</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 주요 내용</h2><h3>소주제</h3><p>교과서식 설명</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>

강의 전사:
${fullText}`,

    transcript: `당신은 전공 서적 전문 에디터입니다. 제공된 강의 전사 텍스트에서 말버릇("어","음")과 사적인 잡담을 제거하고, "교과서 본문(Textbook narrative)" 스타일의 문어체로 다듬어주세요.
"교수님이 말씀하셨다" 같은 강의실 화법은 제거하고, 학술적인 서술로 변환하세요. 명백한 사실 오류가 있다면 교정하여 서술하세요.
번호가 붙은 주제는 각각 <h2>로 분리하고, 한 <p> 안에 여러 번호 주제를 이어 쓰지 마세요. 대화형 안내 문장과 질문 유도 문장은 삭제하세요.
출력: 순수 HTML. html/head/body 태그 없음.
<h1>📄 강의 본문 정제본</h1>
<h2>주제</h2><p>정제되고 교정된 교과서식 본문 내용</p>

강의 전사:
${fullText}`,
  }
  return prompts[mode] || prompts.detailed
}

function splitLectureText(text: string, targetChars = SUMMARY_CHUNK_TARGET_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const chunks: string[] = []
  const paragraphs = normalized.split(/\n{2,}/)
  let current = ''

  const pushCurrent = () => {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
    current = ''
  }

  for (const paragraph of paragraphs) {
    const part = paragraph.trim()
    if (!part) continue

    if (part.length > targetChars) {
      pushCurrent()
      for (let i = 0; i < part.length; i += targetChars) {
        chunks.push(part.slice(i, i + targetChars).trim())
      }
      continue
    }

    if (current && current.length + part.length + 2 > targetChars) pushCurrent()
    current = current ? `${current}\n\n${part}` : part
  }

  pushCurrent()
  return chunks.length ? chunks : [normalized]
}

function buildTocInput(sections: string[], maxChars: number): string {
  const snippets: string[] = []
  const perSection = Math.max(700, Math.floor(maxChars / Math.max(1, sections.length)))

  for (let i = 0; i < sections.length; i++) {
    const text = sections[i].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    snippets.push(`[${i + 1}번째 구간]\n${text.slice(0, perSection)}`)
  }

  const joined = snippets.join('\n\n')
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}\n\n... (이하 생략)` : joined
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSectionTitle(html: string, index: number): string {
  const heading = html.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)?.[1]
  const text = stripHtmlToText(heading || '')
  return text || `${index + 1}번째 강의 구간`
}

function extractSectionSummary(html: string): string {
  const firstParagraph = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
  const text = stripHtmlToText(firstParagraph || html)
  if (!text) return '해당 구간의 핵심 개념과 실무적 맥락을 정리합니다.'
  return text.length > 110 ? `${text.slice(0, 107)}...` : text
}

function buildLocalLectureOutline(sections: string[]): { header: string; footer: string } {
  const validSections = sections.filter(section => section.trim())
  const firstTitle = validSections.length ? extractSectionTitle(validSections[0], 0) : '강의 노트'
  const title = firstTitle.replace(/^\d+\.\s*/, '').trim() || '강의 노트'
  const overviewText = validSections.map(stripHtmlToText).join(' ').slice(0, 260)
  const overview = overviewText
    ? `${overviewText}${overviewText.length >= 260 ? '...' : ''}`
    : '전사 내용을 바탕으로 주요 개념, 사례, 실무적 의미를 정리한 강의 노트입니다.'

  const items = validSections.map((section, index) => {
    const itemTitle = escapeHtml(extractSectionTitle(section, index))
    const itemSummary = escapeHtml(extractSectionSummary(section))
    return `<li><strong>${itemTitle}</strong>: ${itemSummary}</li>`
  }).join('\n')

  return {
    header: `<h1>📚 ${escapeHtml(title)}</h1>\n<p>${escapeHtml(overview)}</p>`,
    footer: `<h2>✅ 전체 핵심 정리</h2>\n<ul>\n${items || '<li>정리 가능한 강의 구간이 없습니다.</li>'}\n</ul>`,
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildTranscriptFallbackHtml(text: string, title: string): string {
  const cleaned = removeFailedTranscriptionMarkers(text)
    .replace(/\b(어|음|그니까|뭐)\b/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  const chunks = splitLectureText(cleaned, 4500).slice(0, 8)
  const paragraphs = chunks.map((chunk, index) => {
    const body = escapeHtml(chunk)
      .split(/\n{2,}/)
      .map(part => `<p>${part.trim().replace(/\n/g, '<br/>')}</p>`)
      .join('\n')
    return `<h2>${index + 1}. 전사 기반 정리 구간</h2>\n${body}`
  }).join('\n\n')

  return `<h1>📚 ${escapeHtml(title)}</h1>
<div class="concept-note"><h4>📌 임시 정리 안내</h4><p>AI 정리 모델 응답이 실패하여 전사 내용을 문단 중심으로 정리한 임시 노트입니다. 전사 내용은 보존되어 있으므로 이후 다시 AI 정리를 실행할 수 있습니다.</p></div>
${paragraphs || '<p>정리 가능한 전사 텍스트가 없습니다.</p>'}`
}

function removeFailedTranscriptionMarkers(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter(part => !/^\s*\[\d+번째 구간 전사 실패\s*—/.test(part.trim()))
    .join('\n\n')
    .trim()
}

// ── 시각화 마커 처리 ──────────────────────────────────────────
// 마커 유형:
//   <!--DIAGRAM: 설명-->  → Neuracoust 교육 SVG
//   <!--CHART: 설명-->    → Neuracoust 교육 SVG
//   <!--IMAGE: 설명-->    → Neuracoust 교육 SVG

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

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 30000)

  try {
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
        signal: ctrl.signal,
      }
    )
    clearTimeout(tid)
    if (!res.ok) return ''
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    // mermaid 코드 블록 추출
    const match = text.match(/```mermaid\s*([\s\S]+?)\s*```/)
    return match ? match[1].trim() : ''
  } catch (e) {
    clearTimeout(tid)
    console.warn(`[callGeminiForMermaid] fetch 오류 또는 타임아웃:`, e)
    return ''
  }
}

async function generateImageBase64(description: string, geminiKey: string): Promise<string | null> {
  const prompt = `Educational lecture illustration for: ${description}. 
Clean infographic style, white background, minimal design, clear labels in Korean where appropriate.`

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 45000)

  try {
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
        signal: ctrl.signal,
      }
    )
    clearTimeout(tid)
    if (!res.ok) return null
    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
      }
    }
    return null
  } catch (e) {
    clearTimeout(tid)
    console.warn(`[generateImageBase64] fetch 오류 또는 타임아웃:`, e)
    return null
  }
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

  // ── DIAGRAM / CHART / IMAGE → Neuracoust 교육 SVG 단일 버튼 ──
  const STRUCT: Record<string, {emoji:string;label:string;color:string;bg:string;border:string}> = {
    DIAGRAM: {emoji:'📊',label:'흐름도',  color:'#6366f1',bg:'#eef2ff',border:'#c7d2fe'},
    CHART:   {emoji:'📈',label:'차트',    color:'#0891b2',bg:'#ecfeff',border:'#a5f3fc'},
  }
  for (const [typeName, cfg] of Object.entries(STRUCT)) {
    result = result.replace(new RegExp(`<!--${typeName}:\\s*(.+?)-->`, 'g'), (_match: string, desc: string) => {
      const id = `vis-${++visIdx}`
      const sa = desc.trim().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      return `<div class="gen-visual-btn" id="${id}" data-vdesc="${sa}" data-vtype="image" style="margin:1rem 0;padding:14px 16px;background:${cfg.bg};border:1.5px dashed ${cfg.border};border-radius:12px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><span style="font-size:22px">${cfg.emoji}</span><div style="flex:1;min-width:0;"><p style="margin:0;font-size:11px;font-weight:700;color:${cfg.color};">${cfg.label} 삽입</p><p style="margin:2px 0 0;font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sa.slice(0,80)}</p></div></div><div style="display:flex;gap:8px;"><button onclick="window._visClick(this,'image',this.closest('[data-vdesc]').dataset.vdesc)" style="flex:1;padding:7px 0;background:${cfg.color};color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">🖼️ AI 이미지 생성</button><button onclick="this.closest('.gen-visual-btn').remove()" style="padding:7px 12px;background:#f1f5f9;color:#94a3b8;border:1.5px solid #e2e8f0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">✕ 삽입 안 함</button></div></div>`
    })
  }

  // ── IMAGE → Neuracoust 교육 SVG 단일 버튼 ──
  result = result.replace(/<!--IMAGE:\s*(.+?)-->/g, (_match: string, desc: string) => {
    const id = `vis-${++visIdx}`
    const sa = desc.trim().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    return `<div class="gen-visual-btn" id="${id}" data-vdesc="${sa}" style="margin:1rem 0;padding:14px 16px;background:#faf5ff;border:1.5px dashed #ddd6fe;border-radius:12px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><span style="font-size:22px">🖼️</span><div style="flex:1;min-width:0;"><p style="margin:0;font-size:11px;font-weight:700;color:#7c3aed;">시각 자료 삽입</p><p style="margin:2px 0 0;font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sa.slice(0,80)}</p></div></div><div style="display:flex;gap:8px;"><button onclick="window._visClick(this,'image',this.closest('[data-vdesc]').dataset.vdesc)" style="flex:1;padding:7px 0;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">🖼️ AI로 만들기</button><button onclick="this.closest('.gen-visual-btn').remove()" style="padding:7px 12px;background:#f1f5f9;color:#94a3b8;border:1.5px solid #e2e8f0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">✕ 삽입 안 함</button></div></div>`
  })

  return result
}

// ── YouTube 관련 강의 검색 (Gemini Google Search grounding) ────
async function addYouTubeSection(html: string, geminiKey: string): Promise<string> {
  try {
    // Gemini에게 강의 텍스트 분석 후 관련 YouTube 검색어 3-5개 추출 + URL 추천
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000)

    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 20_000) // 20초 타임아웃 (YouTube는 선택적 기능)

    let res: Response
    try {
      res = await fetch(
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
          signal: ctrl.signal,
        }
      )
    } catch (fetchErr: any) {
      clearTimeout(tid)
      console.warn('[addYouTubeSection] fetch error or timeout:', fetchErr?.message)
      return html
    }
    clearTimeout(tid)

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





// ── 구간별 전사 (Vercel 300초 제한 회피) ─────────────────────────
function getAudioChunkBytes(transcriptionProvider: string): number {
  return transcriptionProvider === 'deepseek' ? 10 * 1024 * 1024 : OPENAI_DIRECT_UPLOAD_LIMIT
}

function planChunks(fileSizeBytes: number, transcriptionProvider: string) {
  const chunkBytes = getAudioChunkBytes(transcriptionProvider)
  const chunkCount = Math.max(1, Math.ceil(fileSizeBytes / chunkBytes))
  return { chunkBytes, chunkCount }
}

function planOpenAIChunks(fileSizeBytes: number, durationSeconds?: number) {
  if (fileSizeBytes <= OPENAI_DIRECT_UPLOAD_LIMIT || !durationSeconds || durationSeconds <= 0) {
    return {
      chunkBytes: OPENAI_DIRECT_UPLOAD_LIMIT,
      chunkCount: Math.max(1, Math.ceil(fileSizeBytes / OPENAI_DIRECT_UPLOAD_LIMIT)),
      durationSeconds: durationSeconds || null,
      chunkSeconds: null as number | null,
      requiresTranscode: fileSizeBytes > OPENAI_DIRECT_UPLOAD_LIMIT,
    }
  }

  return {
    chunkBytes: OPENAI_DIRECT_UPLOAD_LIMIT,
    chunkCount: Math.max(1, Math.ceil(durationSeconds / OPENAI_AUDIO_CHUNK_SECONDS)),
    durationSeconds,
    chunkSeconds: OPENAI_AUDIO_CHUNK_SECONDS,
    requiresTranscode: true,
  }
}

function getChunkByteRange(chunkIndex: number, chunkBytes: number, fileSizeBytes: number) {
  const start = chunkIndex * chunkBytes
  const end = Math.min(start + chunkBytes - 1, Math.max(0, fileSizeBytes - 1))
  return { start, end }
}

async function downloadAudioRange(
  drive: ReturnType<typeof getDriveClient>,
  fileId: string,
  start: number,
  end: number
): Promise<Buffer> {
  const dlRes = await drive.files.get(
    { fileId, alt: 'media' },
    {
      responseType: 'arraybuffer',
      headers: { Range: `bytes=${start}-${end}` },
    }
  )
  return Buffer.from(dlRes.data as ArrayBuffer)
}

type SummarizeConfig = {
  mode: string
  aiProvider: string
  gemmaKey: string
  geminiKey: string
  geminiModel: string
  openaiKey: string
  openaiModel: string
  deepseekKey: string
  deepseekModel: string
  groqKey: string
  groqModel: string
  selectedKey: string
  selectedModel: string
  courseContext: string
  compressionRatio: number
}

async function runSummarizePhase(
  fullText: string,
  config: SummarizeConfig,
  send: (data: Record<string, unknown>) => void
): Promise<{ html: string; modelUsed: string }> {
  const {
    mode, deepseekKey, deepseekModel, groqKey, groqModel, gemmaKey, courseContext, compressionRatio,
  } = config

  const summaryProvider = gemmaKey ? 'gemma' : groqKey ? 'groq' : deepseekKey ? 'deepseek' : ''
  const summaryKey = gemmaKey || groqKey || deepseekKey
  const summaryModel = gemmaKey ? LECTURE_SUMMARY_MODEL : groqKey ? groqModel : deepseekModel
  if (!summaryProvider || !summaryKey) throw new Error('Neuracoust 직접 모델/Groq/외부 DeepSeek 정리 API 키 설정을 확인하세요.')
  const modelLabel = gemmaKey ? LOCAL_LECTURE_AI_LABEL : groqKey ? `Groq ${summaryModel}` : `외부 DeepSeek ${summaryModel}`
  const modeLabel = mode === 'detailed' ? '전체 상세' : mode === 'transcript' ? '원문 정리' : '핵심 요약'
  send({
    stage: 'processing',
    message: `🧠 [${modelLabel}] 강의 노트 정리 중... (${modeLabel})`,
    progress: 67,
  })

  let html: string

  let elapsedSec = 0
  const keepAliveTimer = setInterval(() => {
    elapsedSec += 20
    send({
      stage: 'processing_wait',
      message: `🧠 [${modelLabel}] 강의 노트 정리 중... (${elapsedSec}초 경과)`,
      progress: Math.min(90, 67 + Math.floor(elapsedSec / 12)),
    })
  }, 20_000)

  try {
    const cleanedFullText = removeFailedTranscriptionMarkers(fullText)
    if (!cleanedFullText) throw new Error('정리 가능한 전사 텍스트가 없습니다. 전사 API 설정을 확인하세요.')

    const textChunks = splitLectureText(cleanedFullText)
    const shouldChunkSummary = fullText.length > DIRECT_SUMMARY_MAX_CHARS || textChunks.length > 1

    if (shouldChunkSummary) {
      send({
        stage: 'chunking',
        message: `🧩 긴 강의라서 ${textChunks.length}개 구간으로 나누어 정리합니다.`,
        progress: 68,
      })

      let rawHtml = ''
      if (mode === 'summary') {
        rawHtml = await processSummary(textChunks, summaryProvider, summaryKey, summaryModel, send)
      } else if (mode === 'transcript') {
        rawHtml = await processTranscript(textChunks, summaryProvider, summaryKey, summaryModel, send)
      } else {
        rawHtml = await processDetailed(textChunks, summaryProvider, summaryKey, summaryModel, send)
      }

      html = processVisuals(normalizeDocumentStructure(rawHtml))
      return { html, modelUsed: modelLabel }
    }

    const rawHtml = await callTextModel('', buildGeminiPrompt(mode, cleanedFullText, courseContext, compressionRatio), summaryProvider, summaryKey, summaryModel)
    html = processVisuals(normalizeDocumentStructure(rawHtml))
  } finally {
    clearInterval(keepAliveTimer)
  }
  send({ stage: 'visuals', message: '🎨 시각화 버튼 삽입 중...', progress: 93 })
  return { html, modelUsed: modelLabel }
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
    step = 'stream',
    fileId,
    chunkIndex = 0,
    fullText: fullTextInput = '',
    mode = 'detailed',
    aiModel = '',  // '' → 각 제공자의 기본 모델
    courseId = '',  // 과목별 AI 컨텍스트 로드에 사용
    compressionRatio = 100,  // 20~100: 정리 분량 비율(%). 100 = 전체 보존
  } = body
  const aiProvider = 'gemma'
  const transcriptionProvider = 'local-ai'
  if (!fileId) return new Response('fileId required', { status: 400 })

  const openaiKey = await resolveOpenAIKey(supabase)
  const gemmaKey = await resolveSettingSecret(
    supabase,
    ['secret_ai_router_api_key', 'secret_remote_api_key', 'secret_gemma_api_key', 'secret_gemma_ai_key'],
    ['AI_ROUTER_API_KEY', 'REMOTE_API_KEY', 'GEMMA_API_KEY']
  )
  const gemmaBaseUrl = await resolveSettingSecret(
    supabase,
    ['ai_router_base_url', 'remote_ai_base_url', 'gemma_base_url', 'secret_gemma_base_url'],
    ['AI_ROUTER_BASE_URL', 'REMOTE_AI_BASE_URL', 'GEMMA_BASE_URL']
  )
  const groqKey = await resolveSettingSecret(supabase, ['secret_groq_api_key'], ['GROQ_API_KEY'])
  const geminiKey = await resolveSettingSecret(
    supabase,
    ['secret_gemini_api_key', 'secret_gemini_image_key'],
    ['GEMINI_API_KEY', 'GEMINI_IMAGE_KEY']
  )
  const deepseekKey = await resolveSettingSecret(supabase, ['secret_deepseek_api_key'], ['DEEPSEEK_API_KEY'])

  if (gemmaKey && !process.env.GEMMA_API_KEY) process.env.GEMMA_API_KEY = gemmaKey
  if (gemmaKey && !process.env.AI_ROUTER_API_KEY) process.env.AI_ROUTER_API_KEY = gemmaKey
  if (gemmaBaseUrl && !process.env.GEMMA_BASE_URL) process.env.GEMMA_BASE_URL = gemmaBaseUrl
  if (gemmaBaseUrl && !process.env.AI_ROUTER_BASE_URL) process.env.AI_ROUTER_BASE_URL = gemmaBaseUrl
  if (geminiKey && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = geminiKey
  if (groqKey && !process.env.GROQ_API_KEY) process.env.GROQ_API_KEY = groqKey
  if (deepseekKey && !process.env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = deepseekKey

  // 모델 결정
  const groqModel = 'llama-3.1-8b-instant'
  const geminiModel = 'gemini-2.0-flash'
  const openaiModel = normalizeOpenAITextModel(aiModel)
  const deepseekModel = 'deepseek-chat'
  
  const selectedKey = gemmaKey || groqKey || deepseekKey
  const selectedModel = gemmaKey ? LECTURE_SUMMARY_MODEL : groqKey ? groqModel : deepseekModel

  const modelLabel = gemmaKey ? LOCAL_LECTURE_AI_LABEL : groqKey ? `Groq ${groqModel}` : deepseekKey ? `외부 DeepSeek ${deepseekModel}` : 'AI 미설정'
  const transcriptionFallbackLabel = [
    '로컬 faster-whisper',
    gemmaKey ? 'Neuracoust 원격 전사' : '',
    groqKey ? 'Groq Whisper' : '',
    deepseekKey ? '외부 DeepSeek 전사' : '',
  ].filter(Boolean).join(' → ') || '전사 API 미설정'

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

  const summarizeConfig: SummarizeConfig = {
    mode, aiProvider, gemmaKey, geminiKey, geminiModel, openaiKey, openaiModel, deepseekKey, deepseekModel,
    groqKey, groqModel, selectedKey, selectedModel, courseContext, compressionRatio,
  }

  // ── step: meta — 파일 정보 + 구간 수 (즉시 응답) ──
  if (step === 'meta') {
    try {
      const drive = getDriveClient()
      const metaRes = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
      const fileName = metaRes.data.name || 'audio.mp3'
      const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
      let durationSeconds: number | undefined

      if (fileSizeBytes > OPENAI_DIRECT_UPLOAD_LIMIT) {
        durationSeconds = await withTempDir(async (dir) => {
          const inputPath = await downloadFullAudioToTemp(drive, fileId, dir, fileName)
          return getAudioDurationSeconds(inputPath)
        })
      }

      const { chunkBytes, chunkCount, chunkSeconds, requiresTranscode } = planOpenAIChunks(fileSizeBytes, durationSeconds)
      return Response.json({
        fileName,
        fileSizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(0),
        chunkCount,
        chunkBytes,
        chunkSeconds,
        requiresTranscode,
        modelLabel,
        transcriptionLabel: transcriptionFallbackLabel,
      })
    } catch (err: unknown) {
      const message = (err as Error)?.message || '파일 정보 조회 실패'
      return Response.json({ error: message }, { status: 500 })
    }
  }

  // ── step: chunk — 구간 1개만 다운로드·전사 (요청당 300초 이내) ──
  if (step === 'chunk') {
    try {
      const drive = getDriveClient()
      const metaRes = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
      const fileName = metaRes.data.name || 'audio.mp3'
      const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
      const mimeType = getMimeType(fileName)
      let durationSeconds: number | undefined
      let chunkCount: number

      if (fileSizeBytes > OPENAI_DIRECT_UPLOAD_LIMIT) {
        durationSeconds = undefined
        chunkCount = Number.MAX_SAFE_INTEGER
      } else {
        chunkCount = 1
      }

      if (chunkIndex < 0 || chunkIndex >= chunkCount) {
        return Response.json({ error: `유효하지 않은 구간 인덱스: ${chunkIndex}` }, { status: 400 })
      }

      let blob: Blob
      let transcribeFileName = fileName
      let plannedChunkCount = chunkCount

      if (fileSizeBytes <= OPENAI_DIRECT_UPLOAD_LIMIT) {
        const { start, end } = getChunkByteRange(0, fileSizeBytes, fileSizeBytes)
        const chunkBuffer = await downloadAudioRange(drive, fileId, start, end)
        blob = new Blob([new Uint8Array(chunkBuffer)], { type: mimeType })
      } else {
        const segment = await withTempDir(async (dir) => {
          const inputPath = await downloadFullAudioToTemp(drive, fileId, dir, fileName)
          durationSeconds = await getAudioDurationSeconds(inputPath)
          plannedChunkCount = Math.max(1, Math.ceil(durationSeconds / OPENAI_AUDIO_CHUNK_SECONDS))

          if (chunkIndex >= plannedChunkCount) {
            throw new Error(`유효하지 않은 구간 인덱스: ${chunkIndex}`)
          }

          const startSeconds = chunkIndex * OPENAI_AUDIO_CHUNK_SECONDS
          const outputPath = path.join(dir, `chunk-${chunkIndex + 1}.mp3`)
          await transcodeAudioSegment(
            inputPath,
            outputPath,
            startSeconds,
            Math.min(OPENAI_AUDIO_CHUNK_SECONDS, Math.max(1, durationSeconds - startSeconds))
          )
          const outputStat = await stat(outputPath)
          if (outputStat.size < 1024) throw new Error(`오디오 구간 ${chunkIndex + 1} 변환 결과가 비어 있습니다.`)
          if (outputStat.size > OPENAI_DIRECT_UPLOAD_LIMIT) {
            throw new Error(`오디오 구간 ${chunkIndex + 1} 변환 파일이 너무 큽니다. (${Math.ceil(outputStat.size / 1024 / 1024)}MB)`)
          }
          return readFile(outputPath)
        })
        blob = new Blob([new Uint8Array(segment)], { type: 'audio/mpeg' })
        transcribeFileName = `chunk_${chunkIndex + 1}_${path.parse(fileName).name}.mp3`
      }

      const exhaustedProviders = new Set<string>()
      const sttKeys = {
        groq: groqKey || undefined,
        gemma: { key: gemmaKey, baseUrl: gemmaBaseUrl },
        deepseek: deepseekKey ? { key: deepseekKey, model: DEEPSEEK_STT_MODEL_DEFAULT } : undefined,
        deepgram: undefined,
        azure: undefined,
        primaryProvider: 'gemma' as const,
      }

      let text: string
      try {
        text = await cascadeTranscribe(
          blob,
          transcribeFileName,
          sttKeys,
          exhaustedProviders,
        )
      } catch (e: unknown) {
        const errShort = ((e as Error)?.message || '알 수 없는 오류').slice(0, 120)
        console.warn(`[Transcribe] Chunk ${chunkIndex + 1} failed:`, errShort)
        text = `[${chunkIndex + 1}번째 구간 전사 실패 — ${errShort}]`
      }

      return Response.json({
        text,
        chunkIndex,
        chunkCount: plannedChunkCount,
        failed: text.includes('전사 실패 —'),
      })
    } catch (err: unknown) {
      const message = (err as Error)?.message || '구간 전사 실패'
      return Response.json({ error: message }, { status: 500 })
    }
  }

  // ── step: summarize — AI 정리만 SSE (전사 텍스트는 클라이언트가 조합) ──
  if (step === 'summarize') {
    if (!fullTextInput?.trim()) {
      return Response.json({ error: 'fullText required' }, { status: 400 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const processingLogs: string[] = []
        const send = (data: Record<string, unknown>) => {
          if (data.message && data.stage !== 'error' && data.stage !== 'done') {
            const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false })
            processingLogs.push(`[${timestamp}] ${data.message}`)
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const fallbackLabels = [
            gemmaKey ? LOCAL_LECTURE_AI_LABEL : '',
            groqKey ? 'Groq' : '',
            deepseekKey ? '외부 DeepSeek' : '',
          ].filter(Boolean).join(', ')
          if (fallbackLabels) {
            send({
              stage: 'fallback_ready',
              message: `🛟 정리 AI 우선순위: ${fallbackLabels}`,
              progress: 66,
            })
          }
          const { html, modelUsed } = await runSummarizePhase(fullTextInput, summarizeConfig, send)
          send({
            stage: 'done',
            message: '✅ 완료!',
            progress: 100,
            html,
            modelUsed,
          })
        } catch (err: unknown) {
          const errorMsg = (err as Error)?.message || '처리 실패'
          const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false })
          processingLogs.push(`[${timestamp}] ❌ 오류 발생: ${errorMsg}`)
          send({ stage: 'error', message: errorMsg, progress: 0, logs: processingLogs })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
        'Content-Encoding': 'none',
      },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const processingLogs: string[] = []
      
      const send = (data: any) => {
        if (data.message && data.stage !== 'error' && data.stage !== 'done') {
          const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false })
          processingLogs.push(`[${timestamp}] ${data.message}`)
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const modelLabel = gemmaKey ? LOCAL_LECTURE_AI_LABEL : groqKey ? `Groq ${groqModel}` : deepseekKey ? `외부 DeepSeek ${deepseekModel}` : 'AI 미설정'

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

        // 전사 청킹 — 요청당 처리 시간을 줄이기 위한 분할
        const AUDIO_CHUNK = 24 * 1024 * 1024
        const audioChunks: Buffer[] = []
        for (let i = 0; i < audioBuffer.length; i += AUDIO_CHUNK) {
          audioChunks.push(audioBuffer.slice(i, i + AUDIO_CHUNK))
        }

        const transcriptions: string[] = new Array(audioChunks.length).fill('')
        const PARALLEL = 4 // Vercel 300초 제한 방어를 위해 병렬 처리 증가 (2->4)
        
        const exhaustedProviders = new Set<string>()

        for (let batchStart = 0; batchStart < audioChunks.length; batchStart += PARALLEL) {
          const batchEnd = Math.min(batchStart + PARALLEL, audioChunks.length)
          const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k)

          // 배치 병렬 전사
          await Promise.all(batchIndices.map(async (i) => {
            const chunkProgress = 10 + Math.floor((i / audioChunks.length) * 55)
            send({
              stage: `transcribe_${i + 1}`,
              message: `🎤 음성 전사 중... ${i + 1}/${audioChunks.length}번째 구간 · ${transcriptionFallbackLabel}`,
              progress: chunkProgress,
            })
            const blob = new Blob([new Uint8Array(audioChunks[i])], { type: mimeType })

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
              const sttKeys = {
                groq: groqKey || undefined,
                gemma: { key: gemmaKey, baseUrl: gemmaBaseUrl },
                deepseek: deepseekKey ? { key: deepseekKey, model: DEEPSEEK_STT_MODEL_DEFAULT } : undefined,
                deepgram: undefined,
                azure: undefined,
                primaryProvider: 'gemma' as const,
              }

              const text = await cascadeTranscribe(
                blob,
                `chunk_${i + 1}_${fileName}`,
                sttKeys,
                exhaustedProviders,
                (msg) => send({
                  stage: `transcribe_${i + 1}_provider`,
                  message: `${msg} (${i + 1}/${audioChunks.length}번째 구간)`,
                  progress: chunkProgress,
                })
              )
              transcriptions[i] = text
            } catch (e: any) {
              const errShort = (e.message || '알 수 없는 오류').slice(0, 120)
              send({
                stage: `transcribe_${i + 1}_error`,
                message: `⚠️ 구간 ${i + 1} 전사 실패: ${errShort} — 계속 진행합니다.`,
                progress: chunkProgress,
              })
              console.warn(`[Transcribe] Chunk ${i + 1} failed: ${e.message}`)
              transcriptions[i] = `[${i + 1}번째 구간 전사 실패 — 해당 부분 누락]`
            } finally {
              clearInterval(keepAliveTimer)
            }
          }))
        }

        const successCount = transcriptions.filter(t => !t.includes('전사 실패 —')).length
        const fullText = transcriptions.filter(t => !t.includes('전사 실패 —')).join('\n\n')
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

        const { html, modelUsed } = await runSummarizePhase(fullText, summarizeConfig, send)

        send({
          stage: 'done',
          message: '✅ 완료!',
          progress: 100,
          html,
          fileName,
          fileSizeMB: fileSizeMB.toFixed(1),
          modelUsed,
        })

      } catch (err: any) {
        const errorMsg = err.message || '처리 실패'
        const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false })
        processingLogs.push(`[${timestamp}] ❌ 오류 발생: ${errorMsg}`)
        send({ stage: 'error', message: errorMsg, progress: 0, logs: processingLogs })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
      'Content-Encoding': 'none',
    },
  })
}
