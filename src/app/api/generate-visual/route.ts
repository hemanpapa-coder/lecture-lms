import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export const maxDuration = 60

const VISUAL_GENERATION_VERSION = 'visual-key-source-v2'
const OPENAI_IMAGE_MODEL_DEFAULT = 'gpt-5.5'
const OPENAI_IMAGE_API_MODEL_DEFAULT = 'gpt-image-1'
const NANO_BANANA_MODEL = 'nano-banana-2'

type ImageEngine = {
  provider: 'openai' | 'gemini'
  requestedModel: string
  apiModel: string
  label: string
}

function resolveImageEngine(model?: string, provider?: string): ImageEngine {
  const requestedModel = (model || '').trim() || OPENAI_IMAGE_MODEL_DEFAULT
  if (provider === 'gemini' || requestedModel.startsWith('nano-banana') || requestedModel.startsWith('gemini')) {
    return {
      provider: 'gemini',
      requestedModel: requestedModel || NANO_BANANA_MODEL,
      apiModel: requestedModel || NANO_BANANA_MODEL,
      label: 'Nano Banana AI 생성',
    }
  }

  return {
    provider: 'openai',
    requestedModel,
    apiModel: process.env.OPENAI_IMAGE_MODEL || OPENAI_IMAGE_API_MODEL_DEFAULT,
    label: requestedModel === 'gpt-5.5' ? 'OpenAI GPT-5.5 이미지 생성' : 'OpenAI 이미지 생성',
  }
}

async function resolveImageSetting(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ provider?: string; model?: string }> {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'ai_image_gen')
      .maybeSingle()

    const raw = data?.value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      provider: parsed?.provider,
      model: parsed?.model,
    }
  } catch {
    return {}
  }
}

async function resolveSettingSecret(
  supabase: Awaited<ReturnType<typeof createClient>>,
  keys: string[],
  envFallbacks: string[] = []
): Promise<string> {
  for (const key of keys) {
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle()
      const value = (data?.value || '').trim()
      if (value) return value
    } catch {}
  }

  for (const envName of envFallbacks) {
    const value = (process.env[envName] || '').trim()
    if (value) return value
  }

  return ''
}

function resolveGemmaRemoteChatUrl(baseUrl?: string): string {
  const base = (baseUrl || process.env.GEMMA_BASE_URL || 'https://neuracoust.tplinkdns.com').trim().replace(/\/$/, '')
  if (base.endsWith('/api/remote/v1/chat')) return base
  if (base.endsWith('/api/remote/v1')) return `${base}/chat`
  return `${base}/api/remote/v1/chat`
}

async function callGemmaRemoteChat(prompt: string, gemmaKey: string, baseUrl?: string): Promise<string> {
  const res = await fetch(resolveGemmaRemoteChatUrl(baseUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${gemmaKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Gemma remote chat ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = (data?.content || data?.choices?.[0]?.message?.content || '').trim()
  if (!text) throw new Error('Gemma remote chat returned empty content')
  return text
}

// 스타일별 프롬프트 지침
const STYLE_GUIDES: Record<string, string> = {
  infographic: `전문적인 교육용 인포그래픽 스타일.
아이콘, 화살표, 단계별 레이아웃과 그림표를 주로 사용.
흰색 배경, 밝고 컬러풀한 디자인, 내용을 한눈에 파악할 수 있는 형식.`,
  diagram: `깔끔한 기술 다이어그램/플로우차트 스타일.
박스, 화살표, 연결선, 다양한 기하학적 도형으로 관계와 흐름 표현.
흰색 배경, 최소한의 색상(2~3색), 논리적 구조가 명확한 다이어그램.`,
  illustration: `귀엽고 친근한 애니메이션·캐릭터 스타일의 일러스트레이션 (어린이·학생 대상).
밝고 컬러풀한 색감, 단순하고 용이한 캐릭터. 한국 교과서 스타일.`,
  illustration_pro: `세련되고 전문적인 성인용 일러스트레이션 스타일.
사실적이고 정교한 묘사, 그라디언트·음영 활용, 현대적이고 고급스러운 디자인.
과학·기술·음악 잡지 스타일.`,
  illustration_biz: `비즈니스·교육 자료용 평면(flat) 일러스트레이션 스타일.
심플한 아이콘과 기하학적 도형, 깔끔하고 전문적인 색상 팔레트(파란·회색 계열).
프레젠테이션·교재에 어울리는 스타일.`,
  simple: `심플하고 미니멀한 스타일.
크고 명확한 시각적 메타포 1~2개 묘사, 충분한 여백.
흰색 배경, 제한된 색상(1~2색), 깔끔하고 현대적인 레이아웃.`,
  photo: `사진 스타일의 현실적인 이미지.
실제 강의 현장, 장비, 개념을 사진처럼 표현.
전문적이고 생동감 있는 피사체 중심의 구성.`,
}

// ── 프롬프트 최적화: 내부 Gemma 서버 우선, Gemini 보조 ──
async function optimizePrompt(
  description: string,
  geminiKey: string,
  style = 'infographic',
  gemmaKey = '',
  gemmaBaseUrl = ''
): Promise<string> {
  const styleGuide = STYLE_GUIDES[style] || STYLE_GUIDES['infographic']
  const prompt = `다음 강의 내용에 대한 이미지 생성 프롬프트를 작성해주세요.

스타일 지침:
${styleGuide}

공통 규칙 (반드시 준수):
- No text labels. Do not include any text, words, or letters in the image.
- 아이콘, 다이어그램, 시각 요소를 크게 강조
- 전체적으로 텍스트 없는 순수 그래픽 중심 구성
- 2~3문장으로 구체적으로 작성
- 결과 프롬프트만 출력

강의 내용: "${description}"`

  if (gemmaKey) {
    try {
      const text = await callGemmaRemoteChat(prompt, gemmaKey, gemmaBaseUrl)
      if (text && text.length > 10) return text
    } catch (e) {
      console.warn('[generate-visual] Gemma prompt optimization failed:', e)
    }
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
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
  return `${styleGuide} Educational content about: ${description}. White background, professional and clear. NO TEXT IN THE IMAGE.`
}

// ── Gemini 이미지 생성 (나노 바나나) ──
async function generateGeminiImage(prompt: string, apiKey: string): Promise<{ dataUrl: string | null, error: string }> {
  const models = [
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-preview-image-generation',
  ]
  let lastError = '';
  for (const model of models) {
    try {
      const imgRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'], temperature: 0.4 },
          }),
        }
      )
      if (imgRes.ok) {
        const imgData = await imgRes.json()
        const parts = imgData?.candidates?.[0]?.content?.parts || []
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            console.log(`[generateGeminiImage] ${model} 성공`)
            return { dataUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, error: '' }
          }
        }
        console.warn(`[generateGeminiImage] ${model}: 이미지 파트 없음`)
        lastError = `[${model}] No image part in response`
      } else {
        const errText = await imgRes.text().catch(() => '')
        lastError = `[${model}] ${imgRes.status} ${errText.slice(0, 200)}`
        console.error(`[generateGeminiImage] ${model} 오류:`, imgRes.status, errText.slice(0, 200))
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      lastError = `[${model}] Exception: ${message}`
      console.error(`[generateGeminiImage] ${model} 실패:`, e)
    }
  }
  console.error("All image models failed. Last error:", lastError)
  return { dataUrl: null, error: lastError }
}

async function generateOpenAIImage(prompt: string, apiKey: string, keySource: string, model: string): Promise<{ dataUrl: string | null, error: string }> {
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        prompt,
        size: '1024x1024',
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { dataUrl: null, error: `OpenAI image ${res.status} (${keySource}): ${sanitizeApiError(errText).slice(0, 200)}` }
    }
    const data = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    const url = data?.data?.[0]?.url
    if (b64) return { dataUrl: `data:image/png;base64,${b64}`, error: '' }
    if (url) return { dataUrl: url, error: '' }
    return { dataUrl: null, error: 'OpenAI image response had no image data' }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { dataUrl: null, error: `OpenAI image exception: ${sanitizeApiError(message)}` }
  }
}

async function resolveOpenAIKey(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ key: string, source: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clients: Array<{ source: string, client: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createSupabaseAdminClient> }> = []

  if (supabaseUrl && serviceRoleKey) {
    clients.push({
      source: 'supabase-service-role',
      client: createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    })
  }

  clients.push({ source: 'supabase-user-session', client: supabase })

  for (const { source, client } of clients) {
    try {
      const { data, error } = await client
        .from('settings')
        .select('value')
        .eq('key', 'secret_openai_api_key')
        .maybeSingle()

      const key = (data?.value || '').trim()
      if (key) return { key, source }
      if (error) console.warn(`[generate-visual] OpenAI key lookup failed via ${source}:`, error.message)
    } catch (error) {
      console.warn(`[generate-visual] OpenAI key lookup exception via ${source}:`, error)
    }
  }

  return { key: '', source: 'none' }
}

function sanitizeApiError(message: string): string {
  return message
    .replace(/sk-proj-[A-Za-z0-9_*.-]+/g, 'sk-proj-***')
    .replace(/sk-[A-Za-z0-9_*.-]+/g, 'sk-***')
    .replace(/sk-proj-[A-Za-z0-9_-]+/g, 'sk-proj-***')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
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

// ── 웹 검색 이미지 (DuckDuckGo Proxy) ──
async function fetchWebImage(query: string): Promise<string | null> {
    try {
        const q = encodeURIComponent(query);
        const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await htmlRes.text();
        const vqdMatch = html.match(/vqd=["']([^"']+)["']/);
        if (!vqdMatch) return null;
        const vqd = vqdMatch[1];

        const imgRes = await fetch(`https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${q}&vqd=${vqd}&f=,,,,&p=1`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        const data = await imgRes.json();
        if (data?.results && data.results.length > 0) {
            // Hotlinking 방지를 우회하기 위해 DDG Proxy URL 사용
            return `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(data.results[0].image)}&f=1&nofb=1`;
        }
    } catch (e) {
        console.error('fetchWebImage error:', e);
    }
    return null;
}

// ── POST 핸들러 ──
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { type, description, style = 'infographic', imageModel = '' } = await req.json()
  if (!type || !description) return NextResponse.json({ error: 'type, description required' }, { status: 400 })

  const geminiKey = process.env.GEMINI_API_KEY || ''
  const gemmaKey = await resolveSettingSecret(supabase, ['secret_gemma_api_key', 'secret_gemma_ai_key'], ['GEMMA_API_KEY'])
  const gemmaBaseUrl = await resolveSettingSecret(supabase, ['gemma_base_url', 'secret_gemma_base_url'], ['GEMMA_BASE_URL'])
  const { key: openaiKey, source: openaiKeySource } = await resolveOpenAIKey(supabase)
  const imageKey = process.env.GEMINI_IMAGE_KEY || geminiKey
  const imageSetting = await resolveImageSetting(supabase)
  const imageEngine = resolveImageEngine(imageModel || imageSetting.model, imageSetting.provider)

  let dataUrl: string | null = null;
  let sourceLabel = '';

  let errorMessage = '';

  if (style === 'search') {
      // 1) 인터넷 검색으로 실제 제품/사진 찾기
      // 키워드 정제 (Gemini로 검색어 최적화)
      let searchKeyword = description;
      if (description.length > 30) {
          const optPrompt = `다음 문장에서 핵심이 되는 구체적인 사물, 기기 또는 제품 명칭을 1~3단어로 추출하세요. 아무 부연 설명 없이 명칭만 반환하세요: "${description}"`;
          try {
              const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: optPrompt }] }] })
              });
              const json = await res.json();
              const extText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
              if (extText) searchKeyword = extText;
          } catch {}
      }
      dataUrl = await fetchWebImage(searchKeyword);
      sourceLabel = '🌐 웹 검색 이미지';

      if (!dataUrl && !imageKey) {
          return NextResponse.json({ error: '이미지 검색 실패 — 검색 결과가 없습니다.', ok: false }, { status: 404 });
      }
  } else {
      // 2) AI 이미지 모델로 그리기
      if (!openaiKey && !imageKey) {
        return NextResponse.json({
          error: '이미지 생성용 OpenAI 키를 Supabase에서 읽지 못했습니다. Vercel의 Supabase 서비스 키 설정을 확인해야 합니다.',
          keySource: openaiKeySource,
          version: VISUAL_GENERATION_VERSION,
          ok: false,
        }, { status: 500 })
      }
      const prompt = (gemmaKey || geminiKey) ? await optimizePrompt(description, geminiKey, style, gemmaKey, gemmaBaseUrl) : `${STYLE_GUIDES[style] || STYLE_GUIDES.infographic}
Educational content about: ${description}. White background, professional and clear. NO TEXT IN THE IMAGE.`
      let resData = imageEngine.provider === 'openai' && openaiKey
        ? await generateOpenAIImage(prompt, openaiKey, openaiKeySource, imageEngine.apiModel)
        : await generateGeminiImage(prompt, imageKey)
      if (!resData.dataUrl && imageKey && /OpenAI image 401|Incorrect API key|invalid_api_key/i.test(resData.error)) {
        const fallbackData = await generateGeminiImage(prompt, imageKey)
        if (fallbackData.dataUrl) {
          resData = fallbackData
          sourceLabel = 'Nano Banana AI 생성'
        } else {
          resData = { dataUrl: null, error: `${resData.error} / Gemini fallback: ${fallbackData.error}` }
        }
      }
      dataUrl = resData.dataUrl
      errorMessage = sanitizeApiError(resData.error)
      if (!sourceLabel) sourceLabel = imageEngine.provider === 'openai' && openaiKey ? imageEngine.label : 'Nano Banana AI 생성';
  }

  if (!dataUrl) {
      if (style === 'search') return NextResponse.json({ error: '이미지 검색 실패 — 적합한 실제 사진을 찾을 수 없습니다.', ok: false }, { status: 404 });
      return NextResponse.json({
        error: `이미지 생성 실패: ${sanitizeApiError(errorMessage)}`,
        keySource: openaiKeySource,
        version: VISUAL_GENERATION_VERSION,
        ok: false,
      }, { status: 500 });
  }

  const caption = description.length > 60 ? description.slice(0, 57) + '...' : description
  const styleLabel = STYLE_LABELS[style] || '실제 제품'
  const safeDesc = description.replace(/"/g, '&quot;')

  const html = `<div class="ai-visual-block" data-ai-desc="${safeDesc}" data-ai-style="${style}" style="margin:1.5rem 0;text-align:center;">
  <img src="${dataUrl}" alt="${description}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,0.08);" />
  <p style="font-size:11px;color:#64748b;margin:8px 0 0;font-style:italic;">${sourceLabel} · ${styleLabel} · ${caption}</p>
</div>`

  return NextResponse.json({ ok: true, html, type: 'image', version: VISUAL_GENERATION_VERSION })
}
