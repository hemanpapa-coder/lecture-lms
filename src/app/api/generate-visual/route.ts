import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// ── 프롬프트 최적화: Gemini로 영어 프롬프트 생성 ──
async function optimizePrompt(description: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `다음 한국어 강의 내용에 대한 교육용 인포그래픽 이미지 생성 프롬프트를 작성해주세요.

규칙:
- 한국어 텍스트 레이블 포함 가능 (인포그래픽 안에 한국어 설명 적극 사용)
- 전문적인 교육용 인포그래픽 스타일
- 아이콘, 화살표, 단계별 레이아웃 등 시각적 요소 풍부하게
- 흰색 배경, 깔끔하고 전문적인 디자인
- 내용을 한눈에 파악할 수 있는 infographic 형식
- 2-3문장으로 구체적으로 작성

강의 내용: "${description}"` }] }],
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
  return `Professional educational infographic illustrating: ${description}. Include Korean text labels, icons, arrows, step-by-step layout. White clean background, detailed and visually rich.`
}

// ── Gemini 이미지 생성 (나노 바나나) ──
async function generateGeminiImage(prompt: string, apiKey: string): Promise<string | null> {
  const models = [
    'gemini-3.1-flash-image-preview',              // 나노 바나나 2 (1순위)
    'gemini-2.0-flash-preview-image-generation',   // 폴백
  ]
  for (const model of models) {
    try {
      const imgRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(45_000),
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
            console.log(`[generateGeminiImage] ${model} 성공`)
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          }
        }
        console.warn(`[generateGeminiImage] ${model}: 이미지 파트 없음`)
      } else {
        const errText = await imgRes.text().catch(() => '')
        console.error(`[generateGeminiImage] ${model} 오류:`, imgRes.status, errText.slice(0, 200))
      }
    } catch (e) {
      console.error(`[generateGeminiImage] ${model} 실패:`, e)
    }
  }
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
  // 이미지 생성은 별도 키(GEMINI_IMAGE_KEY) 우선, 없으면 일반 키 사용
  const imageKey = process.env.GEMINI_IMAGE_KEY || geminiKey
  if (!geminiKey && !imageKey) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 })

  // 프롬프트 최적화 후 이미지 생성
  const prompt = await optimizePrompt(description, geminiKey)
  const dataUrl = await generateGeminiImage(prompt, imageKey)

  if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 — 잠시 후 다시 시도해주세요.', ok: false }, { status: 500 })

  const caption = description.length > 60 ? description.slice(0, 57) + '...' : description
  const html = `<div class="ai-visual-block" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:11px;color:#64748b;margin:8px 0 0;font-style:italic;">🍌 Nano Banana AI 생성 · ${caption}</p>
</div>`

  return NextResponse.json({ ok: true, html, type: 'image' })
}
