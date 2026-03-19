import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── Mermaid 코드 생성 ──────────────────────────────────
async function generateMermaid(description: string, type: 'diagram' | 'chart', apiKey: string): Promise<string> {
  const prompt = type === 'diagram'
    ? `다음 내용을 Mermaid.js flowchart LR 코드로 만들어주세요. 반드시 \`\`\`mermaid ... \`\`\` 블록으로 감싸세요. 한국어 레이블 사용. 코드만 출력:\n${description}`
    : `다음 내용을 Mermaid.js 차트(pie chart 또는 graph 형태)로 만들어주세요. 반드시 \`\`\`mermaid ... \`\`\` 블록으로 감싸세요. 한국어 레이블 사용. 코드만 출력:\n${description}`

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash']
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
  const prompt = `Educational lecture illustration about: "${description}". Clean infographic style, white background, Korean labels, academic style.`

  // ── 1차: 나노바나나2 (gemini-2.0-flash-preview-image-generation) ─
  try {
    const nbRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5_000),  // 5초 내에 응답 없으면 SVG로 폴백
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.4 },
        }),
      }
    )
    if (nbRes.ok) {
      const data = await nbRes.json()
      const parts = data?.candidates?.[0]?.content?.parts || []
      for (const part of parts) {
        if (part.inlineData?.data) {
          console.log('[generateAiImage] nano-banana-2 succeeded')
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
        }
      }
      console.warn('[generateAiImage] nano-banana-2: no image in response')
    } else {
      const errText = await nbRes.text().catch(() => '')
      console.warn('[generateAiImage] nano-banana-2 status:', nbRes.status, errText.slice(0, 200))
    }
  } catch (e) { console.warn('[generateAiImage] nano-banana-2 failed:', e) }

  // ── 2차: Gemini SVG 교육 삽화 생성 (최후 수단, 항상 동작) ────
  try {
    const svgRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create an educational SVG illustration about: "${description}".
Output ONLY valid SVG code starting with <svg and ending with </svg>.
Requirements:
- width="800" height="500"
- White or light background (#f8fafc)
- Use colors: #3b82f6, #10b981, #f59e0b, #6366f1
- Include title and key concept shapes + labels in Korean
- NO external images or fonts
SVG code only:` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      }
    )
    if (svgRes.ok) {
      const svgData = await svgRes.json()
      const svgText: string = svgData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const svgMatch = svgText.match(/<svg[\s\S]+<\/svg>/i)  // greedy: captures full SVG
      if (svgMatch) {
        console.log('[generateAiImage] Gemini SVG succeeded')
        const svgBase64 = Buffer.from(svgMatch[0]).toString('base64')
        return `data:image/svg+xml;base64,${svgBase64}`
      }
      console.warn('[generateAiImage] SVG not found in response')
    }
  } catch (e) { console.warn('[generateAiImage] Gemini SVG failed:', e) }

  return null
}


// ── Wikipedia Search API로 교육용 이미지 탐색 ─────────
async function searchWikipediaImage(description: string): Promise<{
  imgSrc: string | null; pageUrl: string; title: string; snippet: string
} | null> {
  const UA = 'LectureLMS/1.0 (Educational; contact@lecturelms.com)'

  const trySearch = async (lang: 'ko' | 'en', query: string) => {
    // Step 1: 검색
    const sUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json`
    const sRes = await fetch(sUrl, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
    if (!sRes.ok) return null
    const sData = await sRes.json()
    const hits = sData.query?.search
    if (!hits?.length) return null

    const pageTitle = hits[0].title
    const pageUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`

    // Step 2: 이미지 조회
    const iUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&format=json&piprop=original&redirects=1`
    const iRes = await fetch(iUrl, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
    let imgSource: string | null = null
    if (iRes.ok) {
      const iData = await iRes.json()
      const pages = Object.values(iData.query?.pages || {}) as any[]
      imgSource = pages[0]?.original?.source || null
    }

    // Step 3: 이미지가 있으면 base64로 변환
    let imgSrc: string | null = null
    if (imgSource) {
      try {
        const imgFetch = await fetch(imgSource, { headers: { 'User-Agent': UA } })
        if (imgFetch.ok) {
          const contentType = imgFetch.headers.get('content-type') || ''
          // SVG나 텍스트 파일은 제외
          if (contentType.includes('image/') && !contentType.includes('svg')) {
            const buf = await imgFetch.arrayBuffer()
            imgSrc = `data:${contentType.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`
          } else if (contentType.includes('svg')) {
            imgSrc = imgSource // SVG는 src URL 그대로 사용
          }
        }
      } catch {}
    }

    return {
      imgSrc,
      pageUrl,
      title: pageTitle,
      snippet: hits[0].snippet?.replace(/<[^>]+>/g, '').slice(0, 100) || '',
    }
  }

  // 한국어 먼저 → 영어 폴백
  return (await trySearch('ko', description)) ?? (await trySearch('en', description))
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


  // ── Wikipedia 이미지 검색 ───────────────────────────
  if (type === 'search') {
    try {
      const result = await searchWikipediaImage(description)

      if (!result) {
        return NextResponse.json({
          error: 'Wikipedia에서 관련 자료를 찾을 수 없습니다. 🍌 AI로 만들기를 사용해보세요.',
          ok: false
        }, { status: 404 })
      }

      // 이미지가 있는 경우
      if (result.imgSrc) {
        const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${result.imgSrc}" alt="${result.title}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:10px;color:#64748b;margin:8px 0 0;">
    🔍 출처: <a href="${result.pageUrl}" target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:underline;">위키백과 - ${result.title}</a>
  </p>
</div>`
        return NextResponse.json({ ok: true, html, type: 'search' })
      }

      // 이미지 없는 경우 - 텍스트 링크로 대체
      const html = `<div class="ai-visual-block" style="margin:1.5rem 0;padding:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;">
  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0369a1;">📚 관련 위키백과 자료</p>
  <p style="margin:0 0 6px;font-size:12px;color:#374151;">${result.snippet}...</p>
  <a href="${result.pageUrl}" target="_blank" rel="noopener" style="font-size:12px;color:#3b82f6;text-decoration:underline;">→ 위키백과: ${result.title}</a>
  <p style="margin:8px 0 0;font-size:10px;color:#94a3b8;">이미지 없는 문서입니다. 🍌 AI로 만들기로 이미지를 생성해보세요.</p>
</div>`
      return NextResponse.json({ ok: true, html, type: 'wiki-text' })

    } catch (err: any) {
      console.error('[generate-visual search]', err)
      return NextResponse.json({ error: '위키 검색 실패: ' + (err?.message || '알 수 없는 오류'), ok: false }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '알 수 없는 type', ok: false }, { status: 400 })
}
