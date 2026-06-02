import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resolveAiRouterBaseUrl, resolveLocalAiUrl } from '@/lib/ai-router'

export const maxDuration = 60

function pickString(obj: any, paths: string[][]): string {
  for (const path of paths) {
    let cur = obj
    for (const key of path) cur = cur?.[key]
    if (typeof cur === 'string' && cur.trim()) return cur.trim()
  }
  return ''
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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { prompt, style = 'infographic' } = await req.json()
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const apiKey = await resolveSettingSecret(
    supabase,
    ['secret_ai_router_api_key', 'secret_remote_api_key', 'secret_gemma_api_key', 'secret_gemma_ai_key'],
    ['AI_ROUTER_API_KEY', 'REMOTE_API_KEY', 'GEMMA_API_KEY']
  )
  if (!apiKey) return NextResponse.json({ error: 'Neuracoust image API key not configured' }, { status: 500 })

  const baseUrl = await resolveSettingSecret(
    supabase,
    ['ai_router_base_url', 'remote_ai_base_url', 'gemma_base_url', 'secret_gemma_base_url'],
    ['AI_ROUTER_BASE_URL', 'REMOTE_AI_BASE_URL', 'GEMMA_BASE_URL']
  )

  const endpoint = resolveLocalAiUrl(resolveAiRouterBaseUrl(baseUrl), 'image/generate')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      prompt,
      description: prompt,
      style,
      format: 'svg',
      output: 'educational-svg',
    }),
  })

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('image/svg')) {
    const svg = await res.text()
    return NextResponse.json({
      success: true,
      ok: true,
      imageData: Buffer.from(svg).toString('base64'),
      mimeType: 'image/svg+xml',
      svg,
      model: 'neuracoust-educational-svg',
    })
  }

  const raw = await res.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {}

  if (!res.ok || data?.ok === false) {
    const message = data?.error?.message || data?.error || raw || `HTTP ${res.status}`
    return NextResponse.json({ error: `Neuracoust image generation failed: ${message}`, ok: false }, { status: res.ok ? 502 : res.status })
  }

  const svg = pickString(data, [['svg'], ['data', 'svg'], ['visual', 'svg']])
  if (svg) {
    return NextResponse.json({
      success: true,
      ok: true,
      imageData: Buffer.from(svg).toString('base64'),
      mimeType: 'image/svg+xml',
      svg,
      model: data?.provider || data?.engine || 'neuracoust-educational-svg',
    })
  }

  const base64 = pickString(data, [['imageBase64'], ['base64'], ['b64'], ['data', 'imageBase64'], ['data', 'base64'], ['image', 'base64']])
  if (base64) {
    const mimeType = pickString(data, [['mimeType'], ['data', 'mimeType'], ['image', 'mimeType']]) || 'image/png'
    return NextResponse.json({
      success: true,
      ok: true,
      imageData: base64.includes(',') ? base64.split(',').pop() : base64,
      mimeType,
      model: data?.provider || data?.engine || 'neuracoust-image',
    })
  }

  return NextResponse.json({ error: 'Neuracoust image response did not include image data', ok: false }, { status: 502 })
}
