import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── Gemini로 이미지 프롬프트 최적화 ──
async function optimizePrompt(description: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `다음 한국어 강의 내용에 대한 교육용 인포그래픽 생성 프롬프트를 작성해주세요.
규칙:
- 반드시 영어로 프롬프트를 작성하되, 이미지 안의 텍스트/레이블은 반드시 한국어로 표시하도록 명시하세요
- "All text labels and content in the image must be written in Korean" 문구를 반드시 포함하세요
- 전문 기술 용어(DAW, EQ, MIDI 등)는 영어 그대로 유지
- 깔끔한 인포그래픽 스타일, 흰 배경
- 2~3문장으로 작성

강의 내용: "${description}"` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 250 },
        }),
      }
    )
    if (res.ok) {
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text && text.length > 10) return text
    }
  } catch {}
  // 폴백: 기본 프롬프트 (한국어 명시)
  return `Educational infographic about: ${description}. All text labels and content in the image must be written in Korean (한국어). Only technical terms (DAW, EQ, MIDI, etc.) may remain in English. Clean infographic style, white background, professional academic quality.`
}

// ── 이미지 생성 (NanoBanana 1순위 → Pollinations.ai 폴백) ──
async function generateAiImage(description: string, geminiKey: string): Promise<string | null> {
  const imageKey = process.env.GEMINI_IMAGE_KEY || geminiKey

  // 영문 + 한국어 명시 프롬프트 최적화
  const prompt = await optimizePrompt(description, geminiKey)

  // ── 1순위: Gemini NanoBanana (한국어 텍스트 지원) ──
  const geminiModels = [
    'gemini-3.1-flash-image-preview',       // NanoBanana (실제 모델명)
    'gemini-2.0-flash-preview-image-generation', // 폴백
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

  // ── 2순위: Pollinations.ai 폴백 (한국어 렌더링 제한) ──
  try {
    const poliUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true&model=flux`
    const imgRes = await fetch(poliUrl, { signal: AbortSignal.timeout(30_000) })
    if (imgRes.ok) {
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
      if (contentType.startsWith('image/')) {
        const buf = await imgRes.arrayBuffer()
        console.log('[generateAiImage] Pollinations.ai fallback succeeded')
        return `data:${contentType.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`
      }
    }
  } catch (e) { console.warn('[generateAiImage] Pollinations failed:', e) }

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
