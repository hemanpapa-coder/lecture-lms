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
  const form = new FormData()
  form.append('file', audioBlob, fileName)
  form.append('model', 'whisper-large-v3')
  form.append('language', 'ko')
  form.append('response_format', 'text')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Whisper error ${res.status}: ${await res.text()}`)
  return (await res.text()).trim()
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
function buildGeminiPrompt(mode: string, fullText: string): string {
  const prompts: Record<string, string> = {
    detailed: `당신은 강의 속기사(scribe)입니다. 아래 강의 전사 텍스트를 아래 규칙에 따라 처리하세요.

[절대 금지]
- 내용 요약, 압축, 생략 금지. 어떤 내용도 버리지 말 것.

[해야 할 것]
- "어", "음", "그니까", "뭐", "저" 같은 말버릇만 제거
- 구어체를 문어체로 자연스럽게 변환
- 완전한 중복 반복만 1번으로 정리
- 교수님의 모든 예시, 경험담, 비유, 부연설명 포함
- 논리적 흐름으로 소제목 붙여 구조화

[출력 형식] 순수 HTML. html/head/body 태그 없음.
<h1>📚 강의 전체 정리</h1>
<h2>주제 섹션</h2><h3>소주제</h3><p>내용</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>

강의 전사:
${fullText}`,

    summary: `아래 강의 전사 텍스트에서 핵심 개념과 중요 포인트를 추출하여 간결한 강의 요약 노트를 만드세요.
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
  } = body
  if (!fileId) return new Response('fileId required', { status: 400 })

  const groqKey = process.env.GROQ_API_KEY!
  const geminiKey = process.env.GEMINI_API_KEY || ''

  // 모델 결정
  const groqModel = aiModel || 'llama-3.1-8b-instant'
  const geminiModel = aiModel || 'gemini-2.0-flash'

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

        // 전사 청킹
        const AUDIO_CHUNK = 24 * 1024 * 1024
        const audioChunks: Buffer[] = []
        for (let i = 0; i < audioBuffer.length; i += AUDIO_CHUNK) {
          audioChunks.push(audioBuffer.slice(i, i + AUDIO_CHUNK))
        }

        const transcriptions: string[] = []
        for (let i = 0; i < audioChunks.length; i++) {
          send({
            stage: `transcribe_${i + 1}`,
            message: `🎤 음성 전사 중... ${i + 1}/${audioChunks.length}번째 구간`,
            progress: 10 + Math.floor((i / audioChunks.length) * 55),
          })
          const blob = new Blob([new Uint8Array(audioChunks[i])], { type: mimeType })
          try {
            const text = await transcribeChunk(blob, `chunk_${i + 1}_${fileName}`, groqKey)
            transcriptions.push(text)
          } catch (e: any) {
            console.warn(`Chunk ${i + 1} failed:`, e.message)
          }
        }

        const fullText = transcriptions.join('\n\n')
        if (!fullText.trim()) throw new Error('전사 실패 — 음성을 인식할 수 없습니다.')

        const modeLabel = mode === 'detailed' ? '전체 상세' : mode === 'transcript' ? '원문 정리' : '핵심 요약'
        send({
          stage: 'processing',
          message: `🧠 [${modelLabel}] 강의 노트 정리 중... (${modeLabel})`,
          progress: 67,
        })

        let html: string

        if (aiProvider === 'gemini' && geminiKey) {
          // Gemini: 전체 텍스트를 한 번에
          html = await callGemini(buildGeminiPrompt(mode, fullText), geminiKey, geminiModel)
        } else {
          // Groq: 청크 분할 방식
          const wordsPerChunk = mode === 'summary' ? 2000 : 1500
          const textChunks = splitByWords(fullText, wordsPerChunk)

          if (mode === 'detailed') {
            html = await processDetailed(textChunks, groqKey, groqModel, send)
          } else if (mode === 'transcript') {
            html = await processTranscript(textChunks, groqKey, groqModel, send)
          } else {
            html = await processSummary(textChunks, groqKey, groqModel, send)
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
