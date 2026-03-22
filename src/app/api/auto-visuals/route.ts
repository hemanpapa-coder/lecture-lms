import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 30  // 분석만 하므로 30초로 충분

// HTML → 평문 텍스트 변환
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<div class="ai-visual-block"[\s\S]*?<\/div>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── 본문 분석 → 개념 추출만 반환 (이미지 생성은 클라이언트가 별도 수행)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { content } = await req.json()
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY!
  const plainText = htmlToText(content).slice(0, 5000)

  console.log('[auto-visuals] plainText length:', plainText.length, 'preview:', plainText.slice(0, 150))

  let concepts: Array<{ description: string; anchor: string }> = []
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `아래 강의 내용에서 교육용 그림/인포그래픽으로 표현하면 좋을 주제를 정확히 2개 골라주세요. 반드시 2개 선택해야 합니다.

응답 형식 (JSON 배열만, 다른 텍스트 없음):
[
  {"description": "그림 설명 (한국어 20자 이내)", "anchor": "본문 키워드 (10자 이내)"},
  {"description": "그림 설명 (한국어 20자 이내)", "anchor": "본문 키워드 (10자 이내)"}
]

강의 내용:\n${plainText}` }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
          },
        }),
      }
    )
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    console.log('[auto-visuals] Gemini concepts raw:', text.slice(0, 300))
    const parsed = JSON.parse(text)
    concepts = Array.isArray(parsed) ? parsed.filter((c: any) => c?.description && c?.anchor) : []
  } catch (e) {
    console.error('[auto-visuals] concept extraction failed:', e)
    return NextResponse.json({ error: '본문 분석 실패. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  // 폴백: 본문이 있는데 0개면 첫 문장에서 2개 생성
  if (!concepts.length && plainText.length > 50) {
    const words = plainText.split(/\s+/).filter(w => w.length >= 2)
    concepts = [
      { description: words.slice(0, 5).join(' ').slice(0, 20), anchor: words[0]?.slice(0, 10) || '내용' },
      { description: words.slice(6, 11).join(' ').slice(0, 20), anchor: words[6]?.slice(0, 10) || '개념' },
    ]
    console.log('[auto-visuals] fallback concepts:', concepts)
  }

  if (!concepts.length) {
    return NextResponse.json({ error: '이미지를 삽입할 내용을 찾지 못했습니다. 본문 내용을 확인해 주세요.' }, { status: 404 })
  }

  // 이미지 생성 없이 개념만 반환 — 클라이언트에서 /api/generate-visual 각각 호출
  console.log('[auto-visuals] returning concepts:', concepts.length)
  return NextResponse.json({ ok: true, concepts })
}
