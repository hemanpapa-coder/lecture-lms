import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── Mermaid 코드 생성 ──────────────────────────────────
async function generateMermaid(description: string, type: 'diagram' | 'chart', apiKey: string): Promise<string> {
  const systemPrompt = type === 'diagram'
    ? `Mermaid.js flowchart 전문가. 설명을 Mermaid flowchart LR 코드로만 출력. 코드블록(\`\`\`mermaid ... \`\`\`)으로 감싸기. 한국어 레이블 사용.`
    : `Mermaid.js 전문가. 설명을 Mermaid pie chart 코드로만 출력. 코드블록(\`\`\`mermaid ... \`\`\`)으로 감싸기. 한국어 레이블 사용.`

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

// ── Nano Banana 이미지 생성 ────────────────────────────
async function generateNanoBananaImage(description: string, apiKey: string): Promise<string | null> {
  // Gemini로 최적 영어 프롬프트 생성
  let prompt = `Educational lecture illustration: ${description}. Clean infographic style, white background, minimal design. Professional academic quality.`
  try {
    const pr = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `For an educational lecture illustration about: "${description}"\nWrite an optimal image generation prompt in English only. 2-3 sentences. Clean infographic style, white background, professional academic quality.` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
        }),
      }
    )
    if (pr.ok) {
      const pd = await pr.json()
      const pt = pd?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (pt && pt.length > 10) prompt = pt
    }
  } catch {}

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

// ── Wikipedia REST API로 이미지 검색 ──────────────────
async function searchWikipediaImage(description: string, apiKey: string): Promise<{
  imgSrc: string; pageUrl: string; source: string; altText: string
} | null> {
  // Step 1: Gemini로 가장 관련된 Wikipedia 문서 제목 추출 (한국어/영어)
  const kw = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text:
          `다음 강의 시각화 주제에 대해 Wikipedia에서 찾을 수 있는 가장 적합한 문서 제목을 알려주세요.
주제: ${description}
JSON만 출력:
{"ko": "한국어 위키백과 문서 제목", "en": "English Wikipedia article title"}` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 100 },
      }),
    }
  )
  if (!kw.ok) return null
  const kwData = await kw.json()
  const kwText = kwData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const kwMatch = kwText.match(/\{[\s\S]*?\}/)
  if (!kwMatch) return null

  let titles: { ko: string; en: string } = { ko: '', en: '' }
  try { titles = JSON.parse(kwMatch[0]) } catch { return null }

  // Step 2: 한국어 Wikipedia 먼저 시도 → 없으면 영어
  const tryWikipedia = async (lang: string, title: string) => {
    if (!title) return null
    const encoded = encodeURIComponent(title.replace(/ /g, '_'))
    const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`
    try {
      const r = await fetch(apiUrl, { headers: { 'User-Agent': 'LectureLMS/1.0 (Educational)' } })
      if (!r.ok) return null
      const d = await r.json()
      if (!d.thumbnail?.source) return null
      return {
        imgUrl: d.thumbnail.source.replace(/\/\d+px-/, '/800px-'), // 고해상도
        pageUrl: d.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encoded}`,
        title: d.title || title,
        description: d.description || '',
      }
    } catch { return null }
  }

  // 한국어 → 영어 순서로 시도
  let result = await tryWikipedia('ko', titles.ko)
  if (!result) result = await tryWikipedia('en', titles.en)
  if (!result) return null

  // Step 3: 이미지를 서버에서 fetch → base64 변환 (CORS 우회)
  let imgSrc = result.imgUrl
  try {
    const ir = await fetch(result.imgUrl, { headers: { 'User-Agent': 'LectureLMS/1.0 (Educational)' } })
    if (ir.ok) {
      const buf = await ir.arrayBuffer()
      const mime = ir.headers.get('content-type') || 'image/jpeg'
      imgSrc = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
    }
  } catch {}

  const lang = titles.ko ? 'ko' : 'en'
  return {
    imgSrc,
    pageUrl: result.pageUrl,
    source: `${lang === 'ko' ? '한국어' : '영어'} 위키백과 - ${result.title}`,
    altText: result.description || description,
  }
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
    if (!mermaidCode) return NextResponse.json({ error: 'Mermaid 생성 실패' }, { status: 500 })
    const html = `<div class="ai-visual-block" style="margin:1.5rem 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1rem;">
  <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;font-weight:600;">📊 ${type === 'diagram' ? '흐름도' : '차트'}</p>
  <div class="mermaid">${mermaidCode}</div>
  <p style="font-size:10px;color:#cbd5e1;margin:8px 0 0;text-align:right;">${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, mermaidCode, type: 'mermaid' })
  }

  // ── Nano Banana AI 이미지 ───────────────────────────
  if (type === 'image') {
    const dataUrl = await generateNanoBananaImage(description, geminiKey)
    if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 - Nano Banana API 오류' }, { status: 500 })
    const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">🍌 Nano Banana AI 생성 · ${description.slice(0, 60)}</p>
</div>`
    return NextResponse.json({ ok: true, html, type: 'image' })
  }

  // ── Wikipedia 이미지 검색 ───────────────────────────
  if (type === 'search') {
    const result = await searchWikipediaImage(description, geminiKey)
    if (!result) return NextResponse.json({ error: 'Wikipedia에서 관련 이미지를 찾을 수 없습니다. 🍌 AI로 만들기 버튼을 사용해보세요.' }, { status: 404 })

    const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${result.imgSrc}" alt="${result.altText}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#94a3b8;margin:6px 0 0;">
    🔍 출처: <a href="${result.pageUrl}" target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:underline;">${result.source}</a>
    · ${result.altText.slice(0, 50)}
  </p>
</div>`
    return NextResponse.json({ ok: true, html, type: 'search' })
  }

  return NextResponse.json({ error: '알 수 없는 type' }, { status: 400 })
}
