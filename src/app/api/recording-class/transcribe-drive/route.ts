import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

export const maxDuration = 300 // 5분 Vercel 타임아웃

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

// 텍스트를 단어 기준으로 청크 분할 (토큰 한도 대비)
function splitTextIntoChunks(text: string, maxWords = 2000): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '))
  }
  return chunks
}

async function summarizeChunk(text: string, mode: string, groqKey: string, isFinal = false): Promise<string> {
  const systemPrompts: Record<string, string> = {
    detailed: isFinal
      ? `당신은 여러 강의 노트 섹션을 하나의 완성된 강의 노트로 통합하는 전문가입니다.
아래 각 섹션의 강의 내용을 읽고 하나의 완성된 HTML 강의 노트로 통합하세요.
중복 제거하고 논리적 순서로 재구성하세요.
출력: 순수 HTML 태그만, html/head/body 및 코드 블록 없음.
<h1>📚 강의 전체 정리</h1><h2>주제별 섹션</h2><h3>소주제</h3><p>내용</p><h2>✅ 핵심 정리</h2><ul><li>포인트</li></ul>`
      : `당신은 대학 강의 전사 텍스트의 한 섹션을 상세한 HTML 노트로 정리합니다.
핵심 원칙: 내용 90% 이상 보존, 말버릇만 제거, 교재처럼 정리.
출력: 순수 HTML만. <h2>소주제</h2><p>상세 설명</p><ul><li>예시/포인트</li></ul>`,
    
    summary: `당신은 강의 텍스트에서 핵심만 추출하여 간결한 HTML 노트를 만듭니다.
출력: 순수 HTML. <h2>주제</h2><ul><li><strong>개념</strong>: 설명</li></ul>`,
    
    transcript: `당신은 강의 전사 텍스트의 말버릇("어","음","그니까")과 비문만 다듬고 내용은 95% 유지합니다.
문어체로 변환하고 문단 구분 추가. 출력: 순수 HTML.
<h2>주제</h2><p>정제된 강의 내용</p>`,
  }

  const prompt = systemPrompts[mode] || systemPrompts.detailed

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant', // 더 높은 TPM 한도 (On-demand: 20K TPM)
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `강의 내용:\n\n${text}` },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!res.ok) throw new Error(`LLaMA error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  let html = data?.choices?.[0]?.message?.content || ''
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  return html
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

  // SSE 스트림 생성
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // 1단계: 파일 메타데이터
        send({ stage: 'init', message: '📁 Google Drive에서 파일 정보 가져오는 중...', progress: 2 })
        const drive = getDriveClient()
        const metaRes = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
        const fileName = metaRes.data.name || 'audio.mp3'
        const fileSizeBytes = parseInt(metaRes.data.size || '0', 10)
        const fileSizeMB = fileSizeBytes / (1024 * 1024)
        const mimeType = getMimeType(fileName)

        send({ stage: 'downloading', message: `⬇️ 파일 다운로드 중... (${fileSizeMB.toFixed(0)}MB)`, progress: 5 })

        // 2단계: 파일 다운로드
        const dlRes = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'arraybuffer' }
        )
        const audioBuffer = Buffer.from(dlRes.data as ArrayBuffer)

        // 3단계: 전사 (청킹)
        const CHUNK_SIZE = 24 * 1024 * 1024
        const audioChunks: Buffer[] = []
        for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
          audioChunks.push(audioBuffer.slice(i, i + CHUNK_SIZE))
        }
        const totalChunks = audioChunks.length

        const transcriptions: string[] = []
        for (let i = 0; i < audioChunks.length; i++) {
          const progressVal = 10 + Math.floor((i / totalChunks) * 55)
          send({
            stage: `transcribe_${i + 1}`,
            message: `🎤 음성 전사 중... ${i + 1}/${totalChunks}번째 구간`,
            progress: progressVal,
            detail: `${((i / totalChunks) * 100).toFixed(0)}% 전사 완료`
          })

          const chunkBlob = new Blob([new Uint8Array(audioChunks[i])], { type: mimeType })
          try {
            const text = await transcribeChunk(chunkBlob, `chunk_${i + 1}_${fileName}`, groqKey)
            transcriptions.push(text)
          } catch (e: any) {
            console.warn(`Chunk ${i + 1} failed:`, e.message)
          }
        }

        const combinedText = transcriptions.join('\n\n')
        if (!combinedText.trim()) throw new Error('전사 실패 — 음성을 인식할 수 없습니다.')

        // 4단계: 텍스트 분할 후 청크별 요약
        const textChunks = splitTextIntoChunks(combinedText, 2000)
        const totalTextChunks = textChunks.length

        send({
          stage: 'summarize_start',
          message: `🧠 강의 노트 정리 중... (총 ${totalTextChunks}개 섹션)`,
          progress: 67,
        })

        const sectionHtmls: string[] = []
        for (let i = 0; i < textChunks.length; i++) {
          const progressVal = 67 + Math.floor((i / totalTextChunks) * 25)
          send({
            stage: `summarize_${i + 1}`,
            message: `✍️ 섹션 ${i + 1}/${totalTextChunks} 정리 중...`,
            progress: progressVal,
          })

          const sectionHtml = await summarizeChunk(textChunks[i], mode, groqKey, false)
          sectionHtmls.push(sectionHtml)
        }

        // 5단계: 섹션들을 최종 통합
        let finalHtml: string
        if (sectionHtmls.length === 1) {
          finalHtml = sectionHtmls[0]
        } else {
          send({ stage: 'merging', message: '📝 최종 강의 노트 통합 중...', progress: 93 })
          const combinedSections = sectionHtmls.join('\n\n<!-- section break -->\n\n')
          finalHtml = await summarizeChunk(combinedSections, mode, groqKey, true)
        }

        // 완료
        send({
          stage: 'done',
          message: '✅ 완료!',
          progress: 100,
          html: finalHtml,
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
