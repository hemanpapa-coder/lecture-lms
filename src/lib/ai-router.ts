export const AI_ROUTER_LABEL = 'Neuracoust AI Router'

export type AiRouterChatOptions = {
  prompt: string
  systemPrompt?: string
  apiKey?: string
  baseUrl?: string
  allowHeavy?: boolean
  model?: string
  jsonMode?: boolean
  timeoutMs?: number
}

export function resolveAiRouterChatUrl(baseUrl?: string): string {
  const base = (
    baseUrl ||
    process.env.AI_ROUTER_BASE_URL ||
    process.env.REMOTE_AI_BASE_URL ||
    process.env.GEMMA_BASE_URL ||
    'https://neuracoust.tplinkdns.com'
  ).trim().replace(/\/$/, '')

  if (base.endsWith('/api/ai-router/chat')) return base
  if (base.endsWith('/api/ai-router')) return `${base}/chat`
  return `${base}/api/ai-router/chat`
}

export function resolveAiRouterApiKey(apiKey?: string): string {
  return (
    apiKey ||
    process.env.AI_ROUTER_API_KEY ||
    process.env.REMOTE_API_KEY ||
    process.env.GEMMA_API_KEY ||
    ''
  ).trim()
}

export function cleanAiRouterText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:html|json|markdown|md)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

export async function callAiRouterChat(options: AiRouterChatOptions): Promise<string> {
  const key = resolveAiRouterApiKey(options.apiKey)
  if (!key) throw new Error('AI Router API 키가 없습니다.')

  const prompt = [
    options.systemPrompt,
    options.jsonMode ? '응답은 유효한 JSON만 출력하세요. 설명, 코드블록, 마크다운 금지.' : '',
    options.prompt,
  ].filter(Boolean).join('\n\n')

  const body: Record<string, unknown> = {
    prompt,
    allowHeavy: options.allowHeavy ?? false,
  }
  if (options.model) body.model = options.model
  if (options.jsonMode) body.responseFormat = 'json'

  const res = await fetch(resolveAiRouterChatUrl(options.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    body: JSON.stringify(body),
  })

  const raw = await res.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {}

  if (!res.ok || data?.ok === false) {
    const message = data?.error?.message || data?.error || raw || `HTTP ${res.status}`
    throw new Error(`AI Router 오류 (${res.status}): ${String(message).slice(0, 300)}`)
  }

  const content = data?.content || data?.text || data?.message || data?.choices?.[0]?.message?.content || ''
  const cleaned = cleanAiRouterText(String(content || ''))
  if (!cleaned) throw new Error('AI Router returned empty content')
  return cleaned
}
