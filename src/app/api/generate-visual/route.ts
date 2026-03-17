import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

/**
 * 온디맨드 시각화 생성 API
 * - type=diagram|chart → Gemini Flash로 Mermaid 코드 생성
 * - type=image → Nano Banana로 이미지 생성 (base64)
 */

async function generateMermaid(description: string, type: 'diagram' | 'chart', apiKey: string): Promise<string> {
  const systemPrompt = type === 'diagram'
    ? `You are a Mermaid.js expert. Convert the description into a Mermaid flowchart.
Output ONLY the mermaid code block. No explanation.
Example:
\`\`\`mermaid
flowchart LR
  A[마이크] --> B[프리앰프] --> C[AD변환] --> D[DAW]
\`\`\`
Use Korean labels. Keep it clear and concise.`
    : `You are a Mermaid.js expert. Convert the description into a Mermaid pie/xychart.
Output ONLY the mermaid code block. No explanation.
Example:
\`\`\`mermaid
pie title 구성 비율
  "A 요소" : 45
  "B 요소" : 35
  "C 요소" : 20
\`\`\``

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: description }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    }
  )
  if (!res.ok) return ''
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const match = text.match(/```mermaid\s*([\s\S]+?)\s*```/)
  return match ? match[1].trim() : ''
}

async function generateNanoBananaImage(description: string, apiKey: string): Promise<string | null> {
  const prompt = `Educational lecture illustration: ${description}.
Clean infographic style, white background, minimal design, Korean labels where appropriate.
Professional academic quality.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.4 },
      }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type, description } = await req.json()
  if (!type || !description) return NextResponse.json({ error: 'type, description required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY!

  if (type === 'diagram' || type === 'chart') {
    const mermaidCode = await generateMermaid(description, type as 'diagram' | 'chart', geminiKey)
    if (!mermaidCode) return NextResponse.json({ error: 'Mermaid 생성 실패' }, { status: 500 })
    const html = `<div class="ai-visual-block diagram-block" style="margin:1.5rem 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1rem;">
  <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;font-weight:600;">📊 AI 생성 다이어그램</p>
  <div class="mermaid">${mermaidCode}</div>
  <p style="font-size:10px;color:#cbd5e1;margin:8px 0 0;text-align:right;">${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, mermaidCode, type: 'mermaid' })
  }

  if (type === 'image') {
    const dataUrl = await generateNanoBananaImage(description, geminiKey)
    if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패' }, { status: 500 })
    const html = `<div class="ai-visual-block image-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🍌 Nano Banana · ${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, type: 'image' })
  }

  return NextResponse.json({ error: '알 수 없는 type' }, { status: 400 })
}
