import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 120

// HTML → 평문 텍스트 변환
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<div class="ai-visual-block"[\s\S]*?<\/div>/gi, '') // 기존 이미지 블록 제외
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 시각 중심 프롬프트 생성 (Pollinations.ai용 — 텍스트 최소화)
async function makeVisualPrompt(description: string, geminiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a concise English image generation prompt for: "${description}". Rules: visual-only (icons, arrows, colors — minimal text), educational infographic style, white background, professional. Max 2 sentences.` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
        }),
      }
    )
    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text && text.length > 10) return text
    }
  } catch {}
  return `Educational infographic about: ${description}. Visual icons and arrows only, minimal text, clean white background.`
}

// 이미지 생성: Pollinations.ai 1순위 → Gemini 폴백
async function generateImage(prompt: string, imageKey: string): Promise<string | null> {
  // 1순위: Pollinations.ai
  for (const model of ['flux', 'flux-pro', 'turbo']) {
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true&model=${model}&seed=${Math.floor(Math.random() * 9999)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(35_000) })
      if (res.ok) {
        const ct = res.headers.get('content-type') || 'image/jpeg'
        if (ct.startsWith('image/')) {
          const buf = await res.arrayBuffer()
          if (buf.byteLength > 5000) {
            console.log(`[auto-visuals] Pollinations ${model} OK`)
            return `data:${ct.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`
          }
        }
      }
    } catch (e) { console.warn(`[auto-visuals] Pollinations ${model}:`, e) }
  }

  // 2순위: Gemini 이미지
  for (const model of ['gemini-2.0-flash-preview-image-generation', 'gemini-2.0-flash-exp-image-generation']) {
    try {
      const res = await fetch(
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
      if (res.ok) {
        const data = await res.json()
        const parts = data?.candidates?.[0]?.content?.parts || []
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            console.log(`[auto-visuals] Gemini ${model} OK`)
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          }
        }
      }
    } catch (e) { console.warn(`[auto-visuals] Gemini ${model}:`, e) }
  }
  return null
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
  const plainText = htmlToText(content).slice(0, 5000)

  // ── Step 1: 이미지가 필요한 핵심 개념 2~3개 추출 ──
  let concepts: Array<{ description: string; anchor: string }> = []
  console.log('[auto-visuals] plainText length:', plainText.length, 'preview:', plainText.slice(0, 150))
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `아래 강의 내용에서 교육용 그림/인포그래픽으로 표현하면 좋을 주제를 정확히 2개 골라주세요. 어떤 내용이든 반드시 2개를 선택해야 합니다.

응답 형식 (JSON 배열만, 다른 텍스트 없음):
[
  {"description": "그림 설명 (한국어 20자 이내)", "anchor": "본문 키워드 (10자 이내)"},
  {"description": "그림 설명 (한국어 20자 이내)", "anchor": "본문 키워드 (10자 이내)"}
]

강의 내용:\n${plainText}` }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 400,
            responseMimeType: 'application/json',
          },
        }),
      }
    )
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    console.log('[auto-visuals] concept extraction raw:', text.slice(0, 300))
    const parsed = JSON.parse(text)
    concepts = Array.isArray(parsed) ? parsed.filter((c: any) => c?.description && c?.anchor) : []
  } catch (e) {
    console.error('[auto-visuals] concept extraction failed:', e)
    return NextResponse.json({ error: '본문 분석 실패. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }

  // 폴백: 개념 추출 실패 시 본문 첫 단어로 기본 생성
  if (!concepts.length && plainText.length > 50) {
    const words = plainText.split(/\s+/).filter(w => w.length >= 2)
    concepts = [
      { description: words.slice(0, 4).join(' ').slice(0, 20), anchor: words[0]?.slice(0, 10) || '내용' },
      { description: words.slice(5, 9).join(' ').slice(0, 20), anchor: words[5]?.slice(0, 10) || '개념' },
    ]
    console.log('[auto-visuals] using fallback concepts:', concepts)
  }

  // ── Step 2: 각 개념 이미지 생성 (Pollinations.ai 1순위) ──
  const results: Array<{ description: string; anchor: string; html: string }> = []

  for (const concept of concepts.slice(0, 3)) {
    try {
      const prompt = await makeVisualPrompt(concept.description, geminiKey)
      const dataUrl = await generateImage(prompt, imageKey)
      if (dataUrl) {
        const cap = concept.description.slice(0, 60)
        results.push({
          description: concept.description,
          anchor: concept.anchor,
          html: `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${concept.description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:11px;color:#64748b;margin:8px 0 0;font-style:italic;">🍌 AI 생성 시각 자료 · ${cap}</p>
</div>`,
        })
      }
    } catch (e) {
      console.error(`[auto-visuals] failed for ${concept.description}:`, e)
    }
  }

  if (!results.length) return NextResponse.json({ error: '이미지 생성 실패. 잠시 후 다시 시도해주세요.' }, { status: 500 })

  return NextResponse.json({ ok: true, visuals: results })
}
