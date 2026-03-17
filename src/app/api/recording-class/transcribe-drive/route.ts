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
function buildGeminiPrompt(mode: string, fullText: string): string {
  const VISUAL_INSTRUCTIONS = `
[시각화 - 중요]
강의 내용을 정리하면서 아래 개념에 해당하는 곳에 시각화 마커를 삽입하세요:
- 단계별 프로세스, 신호 흐름, 절차 → <!--DIAGRAM: 구체적인 내용 설명-->
- 비교, 구성 비율, 통계 → <!--CHART: 구체적인 내용 설명-->  
- 개념 설명을 위한 삽화, 예시 그림 → <!--IMAGE: 구체적인 내용 설명-->

마커는 해당 설명 직후에 삽입. 강의 1개당 2~5개 정도 적절히 사용.
예) <p>프리앰프는 마이크 신호를 증폭시킵니다.</p><!--DIAGRAM: 마이크 → 프리앰프 → 라인레벨 신호 흐름도-->
`

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
${VISUAL_INSTRUCTIONS}

[출력 형식] 순수 HTML. html/head/body 태그 없음.
<h1>📚 강의 전체 정리</h1>
<h2>주제 섹션</h2><h3>소주제</h3><p>내용</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>

강의 전사:
${fullText}`,

    summary: `아래 강의 전사 텍스트에서 핵심 개념과 중요 포인트를 추출하여 간결한 강의 요약 노트를 만드세요.
${VISUAL_INSTRUCTIONS}
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
//   <!--DIAGRAM: 설명-->  → Mermaid flowchart
//   <!--CHART: 설명-->    → Mermaid xychart/pie
//   <!--IMAGE: 설명-->    → Nano Banana 이미지 생성

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

async function processVisuals(html: string, geminiKey: string, send: (d: object) => void): Promise<string> {
  const DIAGRAM_RE = /<!--DIAGRAM:\s*(.+?)-->/g
  const CHART_RE   = /<!--CHART:\s*(.+?)-->/g
  const IMAGE_RE   = /<!--IMAGE:\s*(.+?)-->/g

  const markers: Array<{ full: string; desc: string; type: 'diagram' | 'chart' | 'image' }> = []

  for (const m of html.matchAll(DIAGRAM_RE)) markers.push({ full: m[0], desc: m[1].trim(), type: 'diagram' })
  for (const m of html.matchAll(CHART_RE))   markers.push({ full: m[0], desc: m[1].trim(), type: 'chart' })
  for (const m of html.matchAll(IMAGE_RE))   markers.push({ full: m[0], desc: m[1].trim(), type: 'image' })

  if (markers.length === 0) return html

  let result = html
  let idx = 0
  for (const marker of markers) {
    idx++
    send({ stage: `visual_${idx}`, message: `🎨 시각화 생성 중... (${idx}/${markers.length}) ${marker.desc.slice(0, 30)}`, progress: 96 + Math.min(3, idx) })

    let replacement = ''

    if (marker.type === 'diagram' || marker.type === 'chart') {
      const mermaidCode = await callGeminiForMermaid(marker.desc, marker.type, geminiKey)
      if (mermaidCode) {
        replacement = `
<div class="ai-visual-block diagram-block" style="margin:1.5rem 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1rem;">
  <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;font-weight:600;">📊 AI 생성 다이어그램</p>
  <div class="mermaid">${mermaidCode}</div>
  <p style="font-size:10px;color:#cbd5e1;margin:8px 0 0;text-align:right;">Mermaid.js · ${marker.desc.slice(0, 50)}</p>
</div>`
      }
    } else if (marker.type === 'image') {
      const dataUrl = await generateImageBase64(marker.desc, geminiKey)
      if (dataUrl) {
        replacement = `
<div class="ai-visual-block image-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${marker.desc}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🤖 AI 생성 일러스트 · ${marker.desc.slice(0, 50)}</p>
</div>`
      }
    }

    if (replacement) {
      result = result.replace(marker.full, replacement)
    } else {
      // 실패하면 마커 제거
      result = result.replace(marker.full, '')
    }
  }
  return result
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
          const rawHtml = await callGemini(buildGeminiPrompt(mode, fullText), geminiKey, geminiModel)
          // 시각화 마커 처리
          send({ stage: 'visuals', message: '🎨 AI 시각화 생성 중...', progress: 95 })
          html = await processVisuals(rawHtml, geminiKey, send)
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
          // Groq 결과에도 geminiKey가 있으면 시각화 처리
          if (geminiKey) {
            send({ stage: 'visuals', message: '🎨 AI 시각화 생성 중...', progress: 95 })
            html = await processVisuals(html, geminiKey, send)
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
