import { NextRequest, NextResponse } from 'next/server'

// OpenAI TTS — tts-1 (빠름, ~5-8초) 또는 tts-1-hd (고품질, ~10-15초)
// Vercel Hobby 60초 제한 내에 안전하게 처리됨
export const maxDuration = 60

// HTML에서 순수 텍스트 추출 (태그/스크립트 제거)
function htmlToPlainText(html: string): string {
  // 스크립트/스타일 제거
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // 시각화 버튼 div 제거 (.gen-visual-btn 등)
    .replace(/<div[^>]*class="[^"]*gen-visual[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    // YouTube 섹션 제거
    .replace(/<div[^>]*class="[^"]*youtube[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    // 태그 → 공백
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '.\n')
    .replace(/<\/li>/gi, '.\n')
    .replace(/<[^>]+>/g, ' ')
    // HTML 엔티티 디코딩
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // URL 제거
    .replace(/https?:\/\/[^\s]+/g, '')
    // 연속 공백/줄바꿈 정리
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

export async function POST(req: NextRequest) {
  try {
    const { html, maxChars = 4000 } = await req.json()
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
    }

    // 텍스트 추출 및 길이 제한
    const rawText = htmlToPlainText(html || '')
    if (!rawText.trim()) {
      return NextResponse.json({ error: '읽을 내용이 없습니다.' }, { status: 400 })
    }
    const text = rawText.slice(0, maxChars)

    // OpenAI TTS API 호출
    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',        // tts-1 (빠름) / tts-1-hd (고품질)
        input: text,
        voice: 'nova',         // nova, alloy, echo, fable, onyx, shimmer
        response_format: 'mp3',
        speed: 1.0,
      }),
    })

    if (!ttsRes.ok) {
      const err = await ttsRes.text()
      return NextResponse.json(
        { error: `OpenAI TTS 오류 (${ttsRes.status}): ${err.slice(0, 200)}` },
        { status: ttsRes.status }
      )
    }

    // MP3 바이너리를 직접 스트리밍 (base64 없이)
    const audioBuffer = await ttsRes.arrayBuffer()

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '처리 실패' }, { status: 500 })
  }
}
