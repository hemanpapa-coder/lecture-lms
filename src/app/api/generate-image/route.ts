import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 60

// 사용 가능한 이미지 생성 모델
const IMAGE_MODELS = {
  'nano-banana-2':   'gemini-2.0-flash-preview-image-generation',  // 빠름·저렴
  'nano-banana-pro': 'gemini-2.0-flash-preview-image-generation',  // 고품질 (같은 모델, 향후 업그레이드 예정)
  'imagen-4':        'imagen-3.0-generate-001',                     // Imagen 3
  'imagen-4-ultra':  'imagen-3.0-fast-generate-001',               // Imagen 3 Fast
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { prompt, model = 'nano-banana-2' } = body
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  const modelId = IMAGE_MODELS[model as keyof typeof IMAGE_MODELS] || IMAGE_MODELS['nano-banana-2']

  // Imagen 계열은 별도 API 사용
  if (modelId.startsWith('imagen-')) {
    return await callImagen(prompt, modelId, geminiKey)
  }

  // Gemini 이미지 생성 (Nano Banana)
  return await callGeminiImage(prompt, modelId, geminiKey)
}

async function callGeminiImage(prompt: string, modelId: string, apiKey: string): Promise<NextResponse> {
  const enhancedPrompt = `Create a clear, educational diagram or illustration for a lecture note. Style: clean, professional infographic style with white background.

Subject: ${prompt}

Requirements:
- Clear labels and text in Korean if needed
- Simple, clean visual style suitable for educational materials
- No photorealistic elements, prefer diagram/chart style
- High contrast for readability`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: enhancedPrompt }]
        }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 0.4,
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`[ImageGen] ${modelId} error:`, err)
    return NextResponse.json({ error: `Image generation failed: ${res.status}` }, { status: 500 })
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts || []

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return NextResponse.json({
        success: true,
        imageData: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
        model: modelId,
      })
    }
  }

  return NextResponse.json({ error: 'No image in response' }, { status: 500 })
}

async function callImagen(prompt: string, modelId: string, apiKey: string): Promise<NextResponse> {
  const enhancedPrompt = `Educational lecture diagram: ${prompt}. Clean infographic style, white background, Korean labels if needed.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateImages?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: enhancedPrompt },
        numberOfImages: 1,
        aspectRatio: '16:9',
        safetyFilterLevel: 'BLOCK_ONLY_HIGH',
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`[Imagen] ${modelId} error:`, err)
    return NextResponse.json({ error: `Imagen failed: ${res.status}` }, { status: 500 })
  }

  const data = await res.json()
  const imageData = data?.generatedImages?.[0]?.image?.imageBytes

  if (!imageData) {
    return NextResponse.json({ error: 'No image data returned' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    imageData,
    mimeType: 'image/jpeg',
    model: modelId,
  })
}
