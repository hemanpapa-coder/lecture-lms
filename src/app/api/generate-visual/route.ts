import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── Gemini로 영문 프롬프트 최적화 ──
async function optimizePrompt(description: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `For an educational lecture illustration about: "${description}"\nWrite an optimal image generation prompt in English only. 2-3 sentences. Clean infographic style, white background, professional academic quality.` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
        }),
      }
    )
    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text && text.length > 10) return text
    }
  } catch {}
  return `Educational lecture illustration: ${description}. Clean infographic style, white background, minimal design. Professional academic quality.`
}

// ── 이미지 생성 (Pollinations.ai → Gemini 이미지 → 실패) ──
async function generateAiImage(description: string, geminiKey: string): Promise<string | null> {
  const imageKey = process.env.GEMINI_IMAGE_KEY || geminiKey

  // 영문 프롬프트 최적화
  const prompt = await optimizePrompt(description, geminiKey)

  // ── 1순위: Pollinations.ai (무료, API 키 불필요) ──
  try {
    const poliUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true&model=flux`
    const imgRes = await fetch(poliUrl, { signal: AbortSignal.timeout(30_000) })
    if (imgRes.ok) {
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
      if (contentType.startsWith('image/')) {
        const buf = await imgRes.arrayBuffer()
        console.log('[generateAiImage] Pollinations.ai succeeded')
        return `data:${contentType.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`
      }
    }
  } catch (e) { console.warn('[generateAiImage] Pollinations failed:', e) }

  // ── 2순위: Gemini 이미지 생성 (NanoBanana 전용 키) ──
  const geminiModels = [
    'gemini-3.1-flash-image-preview',       // 실제 NanoBanana 모델
    'gemini-2.0-flash-preview-image-generation', // 폴백
  ]
  for (const model of geminiModels) {
    try {
      const imgRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${imageKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(25_000),
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
            console.log(`[generateAiImage] ${model} succeeded`)
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          }
        }
        console.warn(`[generateAiImage] ${model} returned no image parts`)
      } else {
        const errText = await imgRes.text().catch(() => '')
        console.error(`[generateAiImage] ${model} error:`, imgRes.status, errText.slice(0, 200))
      }
    } catch (e) { console.error(`[generateAiImage] ${model} failed:`, e) }
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

  const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🍌 AI 생성 컨텐츠 · ${description.slice(0, 60)}</p>
</div>`
  return NextResponse.json({ ok: true, html, type: 'image' })
}
