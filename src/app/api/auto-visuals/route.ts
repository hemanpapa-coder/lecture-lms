import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 120

// HTML → 평문 텍스트 변환
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { content } = await req.json()
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY!
  const imageKey = process.env.GEMINI_IMAGE_KEY || geminiKey
  const plainText = htmlToText(content).slice(0, 6000)

  // ── Step 1: Gemini로 이미지가 필요한 핵심 개념 추출 ──
  const analysisPrompt = `다음 강의 내용을 분석하여 시각 자료(이미지/인포그래픽)가 있으면 이해에 도움이 될 핵심 개념이나 섹션을 2~3개 찾아주세요.

규칙:
- 반드시 JSON 배열로만 응답 (다른 텍스트 없이)
- 각 항목: { "description": "이미지 설명 (한국어 30자 이내)", "anchor": "본문에서 이 문장 근처에 삽입 (20자 이내)" }
- 이미 이미지가 있는 부분은 제외
- 단순 목록보다 개념 관계, 프로세스, 비교 등 시각화 효과가 좋은 내용 선택

강의 내용:
${plainText}`

  let concepts: Array<{ description: string; anchor: string }> = []
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: analysisPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
        }),
      }
    )
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (match) concepts = JSON.parse(match[0])
  } catch (e) {
    console.error('[auto-visuals] analysis failed:', e)
    return NextResponse.json({ error: '본문 분석 실패' }, { status: 500 })
  }

  if (!concepts.length) return NextResponse.json({ error: '이미지 삽입이 필요한 내용을 찾지 못했습니다.' }, { status: 404 })

  // ── Step 2: 각 개념에 맞는 이미지 생성 ──
  const results: Array<{ description: string; anchor: string; html: string | null }> = []

  for (const concept of concepts.slice(0, 3)) {
    try {
      // 프롬프트 최적화
      const promptRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: `강의 내용 "${concept.description}"에 대한 교육용 인포그래픽 이미지 생성 프롬프트를 영어로 작성해주세요. 이미지 안의 모든 텍스트는 반드시 한국어. 기술 용어(DAW, EQ 등)만 영어. 2~3문장. "All text in Korean" 문구 포함.` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
          }),
        }
      )
      let prompt = concept.description
      if (promptRes.ok) {
        const pd = await promptRes.json()
        const pt = pd?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (pt && pt.length > 10) prompt = pt
      }

      // 이미지 생성 (NanoBanana 1순위)
      const models = ['gemini-3.1-flash-image-preview', 'gemini-2.0-flash-preview-image-generation']
      let imgDataUrl: string | null = null
      for (const model of models) {
        const imgRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${imageKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.4 },
            }),
          }
        )
        if (imgRes.ok) {
          const imgData = await imgRes.json()
          const parts = imgData?.candidates?.[0]?.content?.parts || []
          for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
              imgDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
              break
            }
          }
        }
        if (imgDataUrl) break
      }

      if (imgDataUrl) {
        const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${imgDataUrl}" alt="${concept.description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🍌 AI 생성 컨텐츠 · ${concept.description.slice(0, 60)}</p>
</div>`
        results.push({ description: concept.description, anchor: concept.anchor, html })
      } else {
        results.push({ description: concept.description, anchor: concept.anchor, html: null })
      }
    } catch (e) {
      console.error(`[auto-visuals] image gen failed for ${concept.description}:`, e)
      results.push({ description: concept.description, anchor: concept.anchor, html: null })
    }
  }

  // 성공한 이미지만 반환
  const successful = results.filter(r => r.html)
  if (!successful.length) return NextResponse.json({ error: '이미지 생성 실패' }, { status: 500 })

  return NextResponse.json({ ok: true, visuals: successful })
}
