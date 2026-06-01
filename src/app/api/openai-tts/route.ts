import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Neuracoust 원격 TTS — AI Router 서버의 TTS 출력 API 사용
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

async function resolveRemoteKey(): Promise<string> {
  const supabase = await createClient()
  for (const key of ['secret_ai_router_api_key', 'secret_remote_api_key', 'secret_gemma_api_key', 'secret_gemma_ai_key']) {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    const value = (data?.value || '').trim()
    if (value) return value
  }

  return (process.env.AI_ROUTER_API_KEY || process.env.REMOTE_API_KEY || process.env.GEMMA_API_KEY || '').trim()
}

async function resolveRemoteBaseUrl(): Promise<string> {
  const supabase = await createClient()
  for (const key of ['ai_router_base_url', 'remote_ai_base_url', 'gemma_base_url', 'secret_gemma_base_url']) {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    const value = (data?.value || '').trim()
    if (value) return value
  }

  return (process.env.AI_ROUTER_BASE_URL || process.env.REMOTE_AI_BASE_URL || process.env.GEMMA_BASE_URL || 'https://neuracoust.tplinkdns.com').trim()
}

function resolveRemoteTtsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/$/, '')
  if (base.endsWith('/api/remote/v1/tts')) return base
  if (base.endsWith('/api/remote/v1')) return `${base}/tts`
  return `${base}/api/remote/v1/tts`
}

function pickString(obj: any, paths: string[][]): string {
  for (const path of paths) {
    let cur = obj
    for (const key of path) cur = cur?.[key]
    if (typeof cur === 'string' && cur.trim()) return cur.trim()
  }
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const { html, maxChars = 1000 } = await req.json()  // 1000자 제한: 60초 Vercel 타임아웃 안전 (openai 생성 5~15초)
    const remoteKey = await resolveRemoteKey()
    const remoteBaseUrl = await resolveRemoteBaseUrl()
    if (!remoteKey) {
      return NextResponse.json({ error: 'Neuracoust AI Router/TTS API 키가 설정되어 있지 않습니다.' }, { status: 500 })
    }

    // 텍스트 추출 및 길이 제한
    const rawText = htmlToPlainText(html || '')
    if (!rawText.trim()) {
      return NextResponse.json({ error: '읽을 내용이 없습니다.' }, { status: 400 })
    }
    const text = rawText.slice(0, maxChars)

    // Neuracoust 원격 TTS API 호출
    const abortCtrl = new AbortController()
    const abortTimer = setTimeout(() => abortCtrl.abort(), 45_000)
    let ttsRes: Response
    try {
      ttsRes = await fetch(resolveRemoteTtsUrl(remoteBaseUrl), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${remoteKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          input: text,
          voice: 'Kore',
          language: 'ko',
          format: 'wav',
          responseFormat: 'base64',
        }),
        signal: abortCtrl.signal,
      })
    } finally {
      clearTimeout(abortTimer)
    }

    if (!ttsRes.ok) {
      const err = await ttsRes.text()
      return NextResponse.json(
        { error: `Neuracoust TTS 오류 (${ttsRes.status}): ${err.slice(0, 200)}` },
        { status: ttsRes.status }
      )
    }

    const contentType = ttsRes.headers.get('content-type') || ''
    if (contentType.toLowerCase().startsWith('audio/')) {
      const audioBuffer = await ttsRes.arrayBuffer()
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': contentType.split(';')[0] || 'audio/mpeg',
          'Content-Length': audioBuffer.byteLength.toString(),
          'Cache-Control': 'no-store',
        },
      })
    }

    const data = await ttsRes.json()
    const base64 = pickString(data, [
      ['audioBase64'], ['base64'], ['b64'], ['audio'],
      ['data', 'audioBase64'], ['data', 'base64'], ['data', 'b64'], ['data', 'audio'],
    ])
    if (!base64) return NextResponse.json({ error: 'Neuracoust TTS 응답에 오디오 데이터가 없습니다.' }, { status: 500 })
    const normalized = base64.includes(',') ? base64.split(',').pop() || '' : base64
    const mimeType = pickString(data, [['mimeType'], ['contentType'], ['data', 'mimeType']]) || 'audio/wav'
    const audioBuffer = Buffer.from(normalized, 'base64')

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '처리 실패' }, { status: 500 })
  }
}
