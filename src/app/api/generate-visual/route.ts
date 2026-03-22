import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// 스타일별 프롬프트 지침
const STYLE_GUIDES: Record<string, string> = {
  infographic: `전문적인 교육용 인포그래픽 스타일.
한국어 텍스트 레이블을 풍부하게 포함하고, 아이콘·화살표·단계별 레이아웃 사용.
흰색 배경, 밝고 컬러풀한 디자인, 내용을 한눈에 파악할 수 있는 형식.`,
  diagram: `깔끔한 기술 다이어그램/플로우차트 스타일.
박스·화살표·연결선으로 관계와 흐름 표현, 한국어 레이블 포함.
흰색 배경, 최소한의 색상(2~3색), 논리적 구조가 명확한 다이어그램.`,
  illustration: `귀엽고 친근한 애니메이션·캐릭터 스타일의 일러스트레이션 (어린이·학생 대상).
밝고 컬러풀한 색감, 단순하고 용이한 캐릭터. 한국 교과서 스타일. 한국어 텍스트 포함.`,
  illustration_pro: `세련되고 전문적인 성인용 일러스트레이션 스타일.
사실적이고 정교한 묘사, 그라디언트·음영 활용, 현대적이고 고급스러운 디자인.
과학·기술·음악 잡지 스타일. 한국어 텍스트 레이블 포함.`,
  illustration_biz: `비즈니스·교육 자료용 평면(flat) 일러스트레이션 스타일.
심플한 아이콘과 기하학적 도형, 깔끔하고 전문적인 색상 팔레트(파란·회색 계열).
프레젠테이션·교재에 어울리는 스타일. 한국어 텍스트 포함.`,
  simple: `심플하고 미니멀한 스타일.
요점 2~3개만 큰 한국어 텍스트로, 충분한 여백.
흰색 배경, 제한된 색상(1~2색), 깔끔하고 현대적인 레이아웃.`,
  photo: `사진 스타일의 현실적인 이미지.
실제 강의 현장, 장비, 개념을 사진처럼 표현.
한국어 설명 텍스트 레이블 포함, 전문적이고 생동감 있는 구성.`,
}

// ── 프롬프트 최적화: Gemini로 영어 프롬프트 생성 ──
async function optimizePrompt(description: string, apiKey: string, style = 'infographic'): Promise<string> {
  const styleGuide = STYLE_GUIDES[style] || STYLE_GUIDES['infographic']
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `다음 한국어 강의 내용에 대한 이미지 생성 프롬프트를 작성해주세요.

스타일 지침:
${styleGuide}

규칙:
- 2~3문장으로 구체적으로 작성
- 한국어 텍스트 레이블을 이미지 안에 넣도록 명시
- 흰색 또는 밝은 배경 권장

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
  return `${styleGuide} Educational content about: ${description}. Include Korean text labels. White background, professional and clear.`
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

// 스타일 레이블 (한국어)
const STYLE_LABELS: Record<string, string> = {
  infographic: '📊 인포그래픽',
  diagram: '🔷 다이어그램',
  illustration: '🎨 일러스트 (귀여운)',
  illustration_pro: '🖼️ 일러스트 (전문)',
  illustration_biz: '✏️ 일러스트 (비즈니스)',
  simple: '⚡ 심플',
  photo: '📸 사진 스타일',
}

// ── POST 핸들러 ──
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type, description, style = 'infographic' } = await req.json()
  if (!type || !description) return NextResponse.json({ error: 'type, description required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY!
  const imageKey = process.env.GEMINI_IMAGE_KEY || geminiKey
  if (!geminiKey && !imageKey) return NextResponse.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 })

  const prompt = await optimizePrompt(description, geminiKey, style)
  const dataUrl = await generateGeminiImage(prompt, imageKey)

  if (!dataUrl) return NextResponse.json({ error: '이미지 생성 실패 — 잠시 후 다시 시도해주세요.', ok: false }, { status: 500 })

  const caption = description.length > 60 ? description.slice(0, 57) + '...' : description
  const styleLabel = STYLE_LABELS[style] || style
  const safeDesc = description.replace(/"/g, '&quot;')

  const html = `<div class="ai-visual-block" data-ai-desc="${safeDesc}" data-ai-style="${style}" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:11px;color:#64748b;margin:8px 0 0;font-style:italic;">🍌 Nano Banana AI 생성 · ${styleLabel} · ${caption}</p>
</div>`

  return NextResponse.json({ ok: true, html, type: 'image' })
}
