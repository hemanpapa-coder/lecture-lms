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

async function callLlama(systemPrompt: string, userContent: string, groqKey: string, maxTokens = 4096): Promise<string> {
  const MAX_RETRIES = 6

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
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
      // "try again in 18.09s" 패턴에서 초 추출
      const match = errText.match(/try again in (\d+(?:\.\d+)?)s/i)
      const waitSec = match ? Math.ceil(parseFloat(match[1])) + 3 : 65
      console.log(`[LLaMA] Rate limited. Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
      continue
    }

    if (!res.ok) throw new Error(`LLaMA error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    let text = data?.choices?.[0]?.message?.content || ''
    text = text.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return text
  }

  throw new Error('LLaMA 최대 재시도 횟수 초과. Groq 무료 TPM 한도 도달.')
}


// ────────────────────────────────────────────────────────────────
// 방식 1: SCRIBE (detailed) — 말버릇만 제거, 내용 98% 보존
// LangChain의 "Refine" 방식: 이전 결과에 새 내용을 누적
// ────────────────────────────────────────────────────────────────
async function processDetailed(textChunks: string[], groqKey: string, send: (d: object) => void): Promise<string> {
  const SCRIBE_SYSTEM = `당신은 강의 속기사(scribe)입니다.
입력된 강의 전사 텍스트를 아래 규칙에 따라 처리하세요.

[절대 금지]
- 내용 요약, 압축, 생략 금지
- 어떤 내용도 버리지 말 것
- "요약하면", "핵심은" 같은 표현 사용 금지

[해야 할 것]
- "어", "음", "그니까", "뭐", "저", "그래서" 같은 말버릇만 제거
- 구어체를 자연스러운 문어체로 변환
- 같은 내용 반복(즉 "이거 아시죠? 이거 아시죠?")만 1번으로 정리
- 문단 구분을 추가하고 소제목을 붙이되 내용은 그대로 유지
- 교수님이 든 모든 예시, 경험담, 비유, 부연설명 모두 포함

[출력 형식]
순수 HTML. html/head/body 태그 없음. 코드 블록 없음.
<h3>소제목</h3>
<p>정제된 강의 내용 (원문의 내용을 최대한 다 담을 것)</p>
<ul><li>예시나 열거 항목이 있을 때만 사용</li></ul>`

  const sections: string[] = []
  const total = textChunks.length

  for (let i = 0; i < textChunks.length; i++) {
    send({
      stage: `scribe_${i + 1}`,
      message: `✍️ 강의 내용 정서 중... ${i + 1}/${total}번째 구간`,
      progress: 67 + Math.floor((i / total) * 25),
    })

    const result = await callLlama(SCRIBE_SYSTEM, `아래 강의 전사 텍스트를 정서하세요:\n\n${textChunks[i]}`, groqKey)
    sections.push(result)
  }

  // 목차 생성 (Refine 마지막 단계)
  send({ stage: 'toc', message: '📑 목차 생성 중...', progress: 93 })

  const tocSystem = `당신은 HTML 문서 편집자입니다.
아래 여러 강의 섹션 HTML을 받아서:
1. 전체를 감싸는 <h1>📚 [강의 제목 추론]</h1><p>강의 개요 2~3줄</p>를 맨 앞에 추가
2. 각 섹션을 순서대로 이어 붙이기 (내용 수정 절대 금지)
3. 맨 끝에 <h2>✅ 전체 핵심 정리</h2><ul><li>섹션별 핵심 1줄씩</li></ul> 추가

출력: 순수 HTML. 내용 삭제나 요약 절대 금지.`

  const combined = sections.join('\n\n')
  const final = await callLlama(tocSystem, combined, groqKey, 8000)
  return final
}

// ────────────────────────────────────────────────────────────────
// 방식 2: SUMMARY — 핵심만 추출 (MapReduce)
// ────────────────────────────────────────────────────────────────
async function processSummary(textChunks: string[], groqKey: string, send: (d: object) => void): Promise<string> {
  const MAP_SYSTEM = `이 강의 섹션에서 핵심 개념과 중요 포인트만 추출하세요.
출력: 순수 HTML. <h3>주제</h3><ul><li><strong>개념</strong>: 설명</li></ul>`

  const summaries: string[] = []
  for (let i = 0; i < textChunks.length; i++) {
    send({
      stage: `map_${i + 1}`,
      message: `🔍 핵심 추출 중... ${i + 1}/${textChunks.length}번째`,
      progress: 67 + Math.floor((i / textChunks.length) * 20),
    })
    const s = await callLlama(MAP_SYSTEM, textChunks[i], groqKey, 2000)
    summaries.push(s)
  }

  send({ stage: 'reduce', message: '📝 최종 요약 통합 중...', progress: 88 })

  const REDUCE_SYSTEM = `여러 강의 섹션의 핵심 내용을 하나의 완성된 강의 요약 노트로 통합하세요.
중복 제거하고 논리적으로 재구성하세요.
출력: 순수 HTML.
<h1>📚 강의 요약</h1><p>2~3문장 개요</p>
<h2>🎯 핵심 개념</h2><ul><li><strong>개념</strong>: 설명</li></ul>
<h2>📖 주요 내용</h2><h3>소주제</h3><p>설명</p>
<h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>`

  return await callLlama(REDUCE_SYSTEM, summaries.join('\n\n'), groqKey, 4096)
}

// ────────────────────────────────────────────────────────────────
// 방식 3: TRANSCRIPT — 말버릇/비문만 제거, 내용 95%+ 유지
// ────────────────────────────────────────────────────────────────
async function processTranscript(textChunks: string[], groqKey: string, send: (d: object) => void): Promise<string> {
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
    const s = await callLlama(SYSTEM, textChunks[i], groqKey, 5000)
    sections.push(s)
  }

  const header = `<h1>📄 강의 전사 정리본</h1>\n`
  return header + sections.join('\n\n')
}

// 텍스트를 단어 기준으로 청크 분할
function splitByWords(text: string, maxWords = 1500): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '))
  }
  return chunks
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return new Response('Forbidden', { status: 403 })

  const body = await req.json()
  const { fileId, mode = 'detailed' } = body
  if (!fileId) return new Response('fileId required', { status: 400 })

  const groqKey = process.env.GROQ_API_KEY!

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send({ stage: 'init', message: '📁 Google Drive에서 파일 정보 가져오는 중...', progress: 2 })

        const drive = getDriveClient()
        const metaRes = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
        const fileName = metaRes.data.name || 'audio.mp3'
        const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
        const fileSizeMB = fileSizeBytes / (1024 * 1024)
        const mimeType = getMimeType(fileName)

        send({ stage: 'downloading', message: `⬇️ 파일 다운로드 중... (${fileSizeMB.toFixed(0)}MB)`, progress: 5 })

        const dlRes = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'arraybuffer' }
        )
        const audioBuffer = Buffer.from(dlRes.data as ArrayBuffer)

        // ── 전사 단계 ──
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
            detail: `${Math.floor((i / audioChunks.length) * 100)}% 전사 완료`,
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

        send({
          stage: 'processing',
          message: `🧠 강의 노트 정리 시작 (모드: ${mode === 'detailed' ? '전체 상세' : mode === 'transcript' ? '원문 정리' : '핵심 요약'})`,
          progress: 67,
        })

        // ── 텍스트 분할 ──
        // detailed/transcript는 1500단어로 분할 (내용 보존), summary는 더 크게
        const wordsPerChunk = mode === 'summary' ? 2000 : 1500
        const textChunks = splitByWords(fullText, wordsPerChunk)

        // ── 모드별 처리 ──
        let html: string
        if (mode === 'detailed') {
          html = await processDetailed(textChunks, groqKey, send)
        } else if (mode === 'transcript') {
          html = await processTranscript(textChunks, groqKey, send)
        } else {
          html = await processSummary(textChunks, groqKey, send)
        }

        send({
          stage: 'done',
          message: '✅ 완료!',
          progress: 100,
          html,
          fileName,
          fileSizeMB: fileSizeMB.toFixed(1),
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
