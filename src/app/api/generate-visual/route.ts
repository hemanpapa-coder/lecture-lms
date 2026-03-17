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

  // ──────────── DIAGRAM / CHART → Mermaid ────────────
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

  // ──────────── IMAGE → Gemini 최적 프롬프트 생성 후 Nano Banana ────────────
  if (type === 'image') {
    // Step 1: Gemini가 교육 일러스트에 최적화된 프롬프트 생성
    let optimizedPrompt = description
    try {
      const promptRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text:
              `다음 강의 시각화 요청에 대해 Nano Banana (이미지 생성 AI)에게 줄 최적의 영어 프롬프트를 만들어주세요.
요청: ${description}
규칙: 교육 자료, 클린한 인포그래픽 스타일, 흰 배경, 전문적. 영어로만 출력. 1~3문장.`
            }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
          }),
        }
      )
      if (promptRes.ok) {
        const pData = await promptRes.json()
        const pText = pData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (pText) optimizedPrompt = pText
      }
    } catch {}

    // Step 2: Nano Banana 2 호출
    const dataUrl = await generateNanoBananaImage(optimizedPrompt, geminiKey)
    if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 - Nano Banana API를 확인하세요' }, { status: 500 })
    const html = `<div class="ai-visual-block image-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🍌 Nano Banana AI · ${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, type: 'image' })
  }

  // ──────────── SEARCH → Gemini Google Search로 교육용 이미지 찾기 ────────────
  if (type === 'search') {
    try {
      const searchRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text:
              `강의 교육 자료에 사용할 이미지를 인터넷에서 찾아주세요.
주제: ${description}

다음 형식의 JSON만 출력하세요:
{
  "imageUrl": "https://... (실제 이미지 직접 URL - jpg/png/svg/gif)",
  "pageUrl": "https://... (이미지가 있는 페이지)",
  "source": "출처 사이트명",
  "alt": "이미지 설명 (한국어)"
}

조건: Wikipedia, Wikimedia Commons, 교육기관 사이트의 공개 이미지 우선. 실제 존재하는 URL만.`
            }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
          }),
        }
      )

      if (!searchRes.ok) throw new Error('Search failed')
      const searchData = await searchRes.json()
      const searchText = searchData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

      // JSON 파싱
      const jsonMatch = searchText.match(/\{[\s\S]*?\}/)
      if (!jsonMatch) throw new Error('No JSON')
      const info = JSON.parse(jsonMatch[0])

      if (!info.imageUrl) throw new Error('No imageUrl')

      // 이미지를 서버에서 fetch하여 base64로 변환 (CORS 우회)
      let finalSrc = info.imageUrl
      try {
        const imgRes = await fetch(info.imageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Educational Use)' },
        })
        if (imgRes.ok) {
          const imgBuf = await imgRes.arrayBuffer()
          const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'
          finalSrc = `data:${mimeType};base64,${Buffer.from(imgBuf).toString('base64')}`
        }
      } catch {}

      const html = `<div class="ai-visual-block image-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${finalSrc}" alt="${info.alt || description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">
    🔍 출처: <a href="${info.pageUrl || info.imageUrl}" target="_blank" rel="noopener" style="color:#3b82f6;">${info.source || '인터넷'}</a>
    · ${(info.alt || description).slice(0, 50)}
  </p>
</div>`
      return NextResponse.json({ ok: true, html, type: 'search' })
    } catch (err: any) {
      return NextResponse.json({ error: '이미지 검색 실패: ' + err?.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '알 수 없는 type' }, { status: 400 })
}
