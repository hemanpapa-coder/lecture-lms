import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── 프롬프트 최적화: 이미지 안에 텍스트 최소화, 시각 중심 ──
// Pollinations.ai(Flux)는 한국어 불가 → 이미지는 시각적으로만, 한국어는 캡션으로
async function optimizePrompt(description: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `다음 한국어 강의 내용에 대한 교육용 이미지 생성 프롬프트를 영어로 작성해주세요.

규칙:
- 반드시 영어로만 작성
- 이미지 안에 글자/텍스트/레이블을 최소화하세요 (있다면 영어 또는 기술 약어만)
- 개념을 시각적으로 표현 (아이콘, 화살표, 색상, 레이아웃으로만)
- 스타일: clean educational infographic, white background, professional
- 2문장 이내로 간결하게

강의 내용: "${description}"` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 150 },
        }),
      }
    )
    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text && text.length > 10) return text
    }
  } catch {}
  // 폴백: 기본 영어 프롬프트 (텍스트 최소화)
  return `Educational infographic about: ${description}. Minimal text labels, use icons and visual elements to convey concepts. Clean white background, professional academic illustration style.`
}

// ── 이미지 생성: Pollinations.ai 1순위 → Gemini 폴백 ──
async function generateAiImage(description: string, geminiKey: string): Promise<string | null> {
  const imageKey = process.env.GEMINI_IMAGE_KEY || geminiKey
  const prompt = await optimizePrompt(description, geminiKey)

  // ── 1순위: Pollinations.ai (안정적, 무료) ──
  // 한국어 텍스트 렌더링 불가 → 시각 중심 프롬프트로 보완
  const poliModels = ['flux', 'flux-pro', 'turbo']
  for (const model of poliModels) {
    try {
      const poliUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true&model=${model}&seed=${Math.floor(Math.random() * 9999)}`
      const imgRes = await fetch(poliUrl, { signal: AbortSignal.timeout(35_000) })
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
        if (contentType.startsWith('image/')) {
          const buf = await imgRes.arrayBuffer()
          if (buf.byteLength > 5000) {  // 최소 5KB 이상이어야 유효한 이미지
            console.log(`[generateAiImage] Pollinations ${model} succeeded (${buf.byteLength} bytes)`)
            return `data:${contentType.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`
          }
        }
      }
      console.warn(`[generateAiImage] Pollinations ${model}: not ok (${imgRes.status})`)
    } catch (e) {
      console.warn(`[generateAiImage] Pollinations ${model} failed:`, e)
    }
  }

  // ── 2순위: Gemini 이미지 (NanoBanana) 폴백 ──
  const geminiModels = [
    'gemini-2.0-flash-preview-image-generation',
    'gemini-3.1-flash-image-preview',
  ]
  for (const model of geminiModels) {
    try {
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
            console.log(`[generateAiImage] Gemini ${model} succeeded`)
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          }
        }
        console.warn(`[generateAiImage] Gemini ${model}: no image parts`)
      } else {
        const errText = await imgRes.text().catch(() => '')
        console.error(`[generateAiImage] Gemini ${model} error:`, imgRes.status, errText.slice(0, 150))
      }
    } catch (e) { console.error(`[generateAiImage] Gemini ${model} failed:`, e) }
  }

  console.warn('[generateAiImage] All providers failed')
  return null
}

// ── POST 핸들러 ──
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type, description } = await req.json()
  if (!type || !description) return NextResponse.json({ error: 'type, description required' }, { status: 400 })

  const geminiKey = (process.env.GEMINI_API_KEY)!

  const dataUrl = await generateAiImage(description, geminiKey)
  if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 — 잠시 후 다시 시도해주세요.', ok: false }, { status: 500 })

  // 한국어는 이미지 안이 아닌 캡션으로 표시
  const caption = description.length > 60 ? description.slice(0, 57) + '...' : description
  const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:11px;color:#64748b;margin:8px 0 0;font-style:italic;">🍌 AI 생성 시각 자료 · ${caption}</p>
</div>`

  return NextResponse.json({ ok: true, html, type: 'image' })
}
