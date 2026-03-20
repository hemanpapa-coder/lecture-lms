import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── 나노바나나(gemini-3.1-flash-image-preview) AI 이미지 생성 ──
async function generateAiImage(description: string, apiKey: string): Promise<string | null> {
  try {
    const imgRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a clear, educational diagram or illustration about: "${description}". Style: clean, professional infographic with white background and Korean labels if appropriate.` }] }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            temperature: 0.4,
          },
        }),
      }
    )
    if (imgRes.ok) {
      const imgData = await imgRes.json()
      const parts = imgData?.candidates?.[0]?.content?.parts || []
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          console.log('[generateAiImage] gemini-3.1-flash-image-preview succeeded')
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
        }
        // SVG 텍스트도 확인
        const txt: string = part.text || ''
        const svgMatch = txt.match(/<svg[\s\S]+<\/svg>/i)
        if (svgMatch) {
          console.log('[generateAiImage] gemini-3.1 SVG in text succeeded')
          return `data:image/svg+xml;base64,${Buffer.from(svgMatch[0]).toString('base64')}`
        }
      }
      console.warn('[generateAiImage] gemini-3.1 returned no image parts')
    } else {
      const errText = await imgRes.text().catch(() => '')
      console.error('[generateAiImage] gemini-3.1 error:', imgRes.status, errText.slice(0, 200))
    }
  } catch (e) { console.error('[generateAiImage] gemini-3.1 failed:', e) }

  console.warn('[generateAiImage] All methods failed')
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

  const geminiKey = process.env.GEMINI_API_KEY!

  // 모든 타입(diagram, chart, image, search)을 나노바나나 AI 이미지로 처리
  const dataUrl = await generateAiImage(description, geminiKey)
  if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 — 잠시 후 다시 시도해주세요.', ok: false }, { status: 500 })

  const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🍌 AI 생성 컨텐츠 · ${description.slice(0, 60)}</p>
</div>`
  return NextResponse.json({ ok: true, html, type: 'image' })
}
