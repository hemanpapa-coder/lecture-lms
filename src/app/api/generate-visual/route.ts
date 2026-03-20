import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── Mermaid 코드 생성 ──────────────────────────────────
async function generateMermaid(description: string, type: 'diagram' | 'chart', apiKey: string): Promise<string> {
  const prompt = type === 'diagram'
    ? `다음 내용을 Mermaid.js flowchart LR 코드로 만들어주세요. 반드시 \`\`\`mermaid ... \`\`\` 블록으로 감싸세요. 한국어 레이블 사용. 코드만 출력:\n${description}`
    : `다음 내용을 Mermaid.js 차트(pie chart 또는 graph 형태)로 만들어주세요. 반드시 \`\`\`mermaid ... \`\`\` 블록으로 감싸세요. 한국어 레이블 사용. 코드만 출력:\n${description}`

  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite']
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    )
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error(`[generateMermaid] ${model} error ${res.status}:`, errText.slice(0, 300))
      continue // 다음 모델로 폴백
    }
    const data = await res.json()
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    // 코드블록 추출 (```mermaid ... ``` 또는 ``` ... ```)
    const m1 = text.match(/```mermaid\s*([\s\S]+?)\s*```/)
    if (m1) return m1[1].trim()
    const m2 = text.match(/```\s*([\s\S]+?)\s*```/)
    if (m2) return m2[1].trim()
    // 코드블록 없으면 그대로 반환 (graph/flowchart 키워드 있을 때)
    if (text.includes('flowchart') || text.includes('graph') || text.includes('pie')) return text.trim()
    // 응답은 왔지만 Mermaid 코드가 없음 → 다음 모델 시도
    console.warn(`[generateMermaid] ${model} returned no valid mermaid code`)
  }
  return ''
}

// ── AI 이미지/시각 자료 생성 ──────────────────────────
async function generateAiImage(description: string, apiKey: string): Promise<string | null> {

  // ── 방법 1: Gemini SVG (텍스트 → SVG) ──
  try {
    const svgRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create an educational SVG illustration about: "${description}".
Output ONLY valid SVG code starting with <svg and ending with </svg>.
Requirements:
- width="800" height="500"
- White or light background (#f8fafc)
- Use colors: #3b82f6, #10b981, #f59e0b, #6366f1
- Include meaningful title, icons, labels, and content in Korean
- Make it visually informative with actual educational content, NOT empty placeholder circles
- Include at least 3-5 labeled elements relevant to the topic
- NO external images or fonts
SVG code only:` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
        }),
      }
    )
    if (svgRes.ok) {
      const svgData = await svgRes.json()
      const svgText: string = svgData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const svgMatch = svgText.match(/<svg[\s\S]+<\/svg>/i)
      if (svgMatch) {
        console.log('[generateAiImage] Gemini SVG succeeded')
        const svgBase64 = Buffer.from(svgMatch[0]).toString('base64')
        return `data:image/svg+xml;base64,${svgBase64}`
      }
      console.warn('[generateAiImage] SVG not found in response, trying image fallback')
    } else {
      const errText = await svgRes.text().catch(() => '')
      console.error('[generateAiImage] Gemini SVG API error:', svgRes.status, errText.slice(0, 200))
    }
  } catch (e) { console.error('[generateAiImage] Gemini SVG failed:', e) }

  // ── 방법 2: 나노바나나(gemini-3.1-flash-image-preview) 실제 이미지 생성 ──
  try {
    const imgRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
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

// ── POST 핸들러 ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type, description } = await req.json()
  if (!type || !description) return NextResponse.json({ error: 'type, description required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY!

  // ── Mermaid 다이어그램/차트 ─────────────────────────
  if (type === 'diagram' || type === 'chart') {
    const mermaidCode = await generateMermaid(description, type as 'diagram' | 'chart', geminiKey)
    if (!mermaidCode) {
      return NextResponse.json({ error: `Mermaid 생성 실패: Gemini API 응답 오류`, ok: false }, { status: 500 })
    }
    const label = type === 'diagram' ? '흐름도' : '차트'
    const html = `<div class="ai-visual-block" style="margin:1.5rem 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1rem;">
  <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;font-weight:600;">📊 AI 생성 ${label}</p>
  <div class="mermaid">${mermaidCode}</div>
  <p style="font-size:10px;color:#cbd5e1;margin:8px 0 0;text-align:right;">${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, mermaidCode, type: 'mermaid' })
  }

  // ── Nano Banana AI 이미지 ───────────────────────────
  if (type === 'image') {
    const dataUrl = await generateAiImage(description, geminiKey)
    if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 — 잠시 후 다시 시도해주세요.', ok: false }, { status: 500 })
    const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🤖 AI 생성 컨텐츠 · ${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, type: 'image' })
  }

  // ── search 타입 → 나노바나나(AI 이미지)로 처리 ──────
  if (type === 'search') {
    const dataUrl = await generateAiImage(description, geminiKey)
    if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 — 잠시 후 다시 시도해주세요.', ok: false }, { status: 500 })
    const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🤖 AI 생성 컨텐츠 · ${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, type: 'image' })
  }

  return NextResponse.json({ error: '알 수 없는 type', ok: false }, { status: 400 })
}
