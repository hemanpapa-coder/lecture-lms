/**
 * 통합 AI 프로바이더 라이브러리
 * 
 * 지원 프로바이더:
 *  - gemini  : Google Gemini (기본값, 유료)
 *  - groq    : Groq Cloud (무료, 텍스트 전용)
 *  - openai  : OpenAI GPT + Whisper (유료, 저렴)
 * 
 * 기능별 기본 프로바이더:
 *  - text       : gemini (변경 가능)
 *  - vision     : gemini (이미지 읽기, 변경 가능)
 *  - transcribe : gemini (음성→텍스트, 변경 가능)
 *  - image_gen  : gemini (이미지 생성, 변경/비활성화 가능)
 *  - tts        : gemini (텍스트→음성, 변경 가능)
 */

import { createClient } from '@supabase/supabase-js'

// ─── 타입 ────────────────────────────────────────────────────────────
export type AiCategory = 'text' | 'vision' | 'transcribe' | 'image_gen' | 'tts'
export type AiProvider = 'gemini' | 'groq' | 'openai' | 'disabled'

export interface AiMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface AiTextOptions {
    temperature?: number
    maxTokens?: number
    jsonMode?: boolean
    systemPrompt?: string
}

// ─── 기본값 ──────────────────────────────────────────────────────────
export const AI_CATEGORY_DEFAULTS: Record<AiCategory, { provider: AiProvider; model: string; label: string }> = {
    text:       { provider: 'gemini', model: 'gemini-2.0-flash',      label: 'AI 채팅 / 평가 / 리포트' },
    vision:     { provider: 'gemini', model: 'gemini-1.5-flash',      label: '이미지 인식 (출석부 OCR 등)' },
    transcribe: { provider: 'gemini', model: 'gemini-1.5-flash',      label: '음성 → 텍스트 전사' },
    image_gen:  { provider: 'gemini', model: 'gemini-2.0-flash-preview-image-generation', label: '이미지 생성' },
    tts:        { provider: 'gemini', model: 'gemini-2.5-flash-preview-tts', label: '텍스트 → 음성 합성' },
}

// Groq에서 쓸 모델 (provider=groq 선택 시)
export const GROQ_MODELS: Record<string, string> = {
    fast:    'llama-3.1-8b-instant',
    default: 'llama-3.3-70b-versatile',
    smart:   'llama-3.3-70b-versatile',
    transcribe: 'whisper-large-v3',
}

// OpenAI에서 쓸 모델 (provider=openai 선택 시)
export const OPENAI_MODELS: Record<string, string> = {
    fast:    'gpt-4o-mini',
    default: 'gpt-4o-mini',
    smart:   'gpt-4o',
    transcribe: 'whisper-1',
    tts:     'tts-1',
    vision:  'gpt-4o-mini',
}

// ─── 설정 읽기 ───────────────────────────────────────────────────────
let _cachedSettings: Record<AiCategory, { provider: AiProvider; model: string }> | null = null
let _cacheTime = 0

export async function getAiSettings(): Promise<Record<AiCategory, { provider: AiProvider; model: string }>> {
    // 60초 캐시
    if (_cachedSettings && Date.now() - _cacheTime < 60_000) return _cachedSettings

    try {
        const supa = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data } = await supa.from('settings').select('key, value').like('key', 'ai_provider_%')
        const result: Record<string, { provider: AiProvider; model: string }> = {}
        for (const cat of Object.keys(AI_CATEGORY_DEFAULTS) as AiCategory[]) {
            const row = (data || []).find(r => r.key === `ai_provider_${cat}`)
            if (row?.value) {
                try {
                    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
                    result[cat] = { provider: parsed.provider, model: parsed.model }
                } catch { /* fall through */ }
            }
            if (!result[cat]) {
                result[cat] = { provider: AI_CATEGORY_DEFAULTS[cat].provider, model: AI_CATEGORY_DEFAULTS[cat].model }
            }
        }
        _cachedSettings = result as Record<AiCategory, { provider: AiProvider; model: string }>
        _cacheTime = Date.now()
        return _cachedSettings
    } catch {
        const fallback: Record<string, { provider: AiProvider; model: string }> = {}
        for (const cat of Object.keys(AI_CATEGORY_DEFAULTS) as AiCategory[]) {
            fallback[cat] = { provider: AI_CATEGORY_DEFAULTS[cat].provider, model: AI_CATEGORY_DEFAULTS[cat].model }
        }
        return fallback as Record<AiCategory, { provider: AiProvider; model: string }>
    }
}

export function clearAiSettingsCache() { _cachedSettings = null }

// ─── API 키 헬퍼 ─────────────────────────────────────────────────────
export function getApiKey(provider: AiProvider): string {
    switch (provider) {
        case 'gemini':  return process.env.GEMINI_API_KEY || process.env.GEMINI_IMAGE_KEY || ''
        case 'groq':    return process.env.GROQ_API_KEY || ''
        case 'openai':  return process.env.OPENAI_API_KEY || ''
        default:        return ''
    }
}

// ─── 텍스트 생성 ─────────────────────────────────────────────────────
export async function generateText(
    messages: AiMessage[],
    opts: AiTextOptions = {},
    forceProvider?: AiProvider,
    forceModel?: string,
): Promise<string> {
    const settings = await getAiSettings()
    const provider = forceProvider || settings.text.provider
    const { temperature = 0.3, maxTokens = 4096, jsonMode = false, systemPrompt } = opts

    if (provider === 'groq') {
        return generateTextGroq(messages, { temperature, maxTokens, jsonMode, systemPrompt }, forceModel)
    }
    if (provider === 'openai') {
        return generateTextOpenAI(messages, { temperature, maxTokens, jsonMode, systemPrompt }, forceModel)
    }
    // default: gemini
    const model = forceModel || settings.text.model
    return generateTextGemini(messages, { temperature, maxTokens, jsonMode, systemPrompt }, model)
}

// ─── Gemini 텍스트 ───────────────────────────────────────────────────
async function generateTextGemini(messages: AiMessage[], opts: AiTextOptions, model: string): Promise<string> {
    const key = getApiKey('gemini')
    if (!key) throw new Error('Gemini API 키가 없습니다. 관리자 설정에서 키를 입력해주세요.')

    const systemParts = opts.systemPrompt ? [{ text: opts.systemPrompt }] : []
    const geminiMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    
    // system 메시지가 messages 안에 있는 경우도 추출
    const sysFromMessages = messages.find(m => m.role === 'system')
    if (sysFromMessages && !opts.systemPrompt) systemParts.push({ text: sysFromMessages.content })

    const body: any = {
        contents: geminiMessages,
        generationConfig: { temperature: opts.temperature ?? 0.3, maxOutputTokens: opts.maxTokens ?? 4096 }
    }
    if (systemParts.length) body.system_instruction = { parts: systemParts }
    if (opts.jsonMode) body.generationConfig.responseMimeType = 'application/json'

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

// ─── Groq 텍스트 ────────────────────────────────────────────────────
async function generateTextGroq(messages: AiMessage[], opts: AiTextOptions, forceModel?: string): Promise<string> {
    const key = getApiKey('groq')
    if (!key) throw new Error('Groq API 키가 없습니다. 관리자 설정에서 GROQ_API_KEY를 입력해주세요.')

    const model = forceModel || GROQ_MODELS.default
    const msgs = opts.systemPrompt
        ? [{ role: 'system', content: opts.systemPrompt }, ...messages.filter(m => m.role !== 'system')]
        : messages

    const body: any = {
        model,
        messages: msgs,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4096,
    }
    if (opts.jsonMode) body.response_format = { type: 'json_object' }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return data?.choices?.[0]?.message?.content?.trim() || ''
}

// ─── OpenAI 텍스트 ──────────────────────────────────────────────────
async function generateTextOpenAI(messages: AiMessage[], opts: AiTextOptions, forceModel?: string): Promise<string> {
    const key = getApiKey('openai')
    if (!key) throw new Error('OpenAI API 키가 없습니다. 관리자 설정에서 OPENAI_API_KEY를 입력해주세요.')

    const model = forceModel || OPENAI_MODELS.default
    const msgs = opts.systemPrompt
        ? [{ role: 'system', content: opts.systemPrompt }, ...messages.filter(m => m.role !== 'system')]
        : messages

    const body: any = {
        model, messages: msgs,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4096,
    }
    if (opts.jsonMode) body.response_format = { type: 'json_object' }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return data?.choices?.[0]?.message?.content?.trim() || ''
}

// ─── Vision (이미지 인식) ────────────────────────────────────────────
export async function generateVision(
    prompt: string,
    imageBase64: string,
    mimeType: string,
    forceProvider?: AiProvider,
): Promise<string> {
    const settings = await getAiSettings()
    const provider = forceProvider || settings.vision.provider

    if (provider === 'openai') {
        const key = getApiKey('openai')
        if (!key) throw new Error('OpenAI API 키가 없습니다.')
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: OPENAI_MODELS.vision,
                messages: [{ role: 'user', content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
                ]}],
                max_tokens: 4096,
            })
        })
        if (!res.ok) throw new Error(`OpenAI vision error ${res.status}`)
        const data = await res.json()
        return data?.choices?.[0]?.message?.content?.trim() || ''
    }

    // default: gemini
    const key = getApiKey('gemini')
    if (!key) throw new Error('Gemini API 키가 없습니다.')
    const model = settings.vision.model
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]}],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        })
    })
    if (!res.ok) throw new Error(`Gemini vision error ${res.status}`)
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

// ─── 음성 전사 ──────────────────────────────────────────────────────
export async function transcribeAudio(
    audioBuffer: ArrayBuffer,
    mimeType: string,
    forceProvider?: AiProvider,
): Promise<string> {
    const settings = await getAiSettings()
    const provider = forceProvider || settings.transcribe.provider

    if (provider === 'groq') {
        const key = getApiKey('groq')
        if (!key) throw new Error('Groq API 키가 없습니다.')
        const formData = new FormData()
        formData.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.webm')
        formData.append('model', GROQ_MODELS.transcribe)
        formData.append('language', 'ko')
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: formData
        })
        if (!res.ok) throw new Error(`Groq transcribe error ${res.status}`)
        const data = await res.json()
        return data.text || ''
    }

    if (provider === 'openai') {
        const key = getApiKey('openai')
        if (!key) throw new Error('OpenAI API 키가 없습니다.')
        const formData = new FormData()
        formData.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.webm')
        formData.append('model', OPENAI_MODELS.transcribe)
        formData.append('language', 'ko')
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: formData
        })
        if (!res.ok) throw new Error(`OpenAI whisper error ${res.status}`)
        const data = await res.json()
        return data.text || ''
    }

    // default: gemini
    const key = getApiKey('gemini')
    if (!key) throw new Error('Gemini API 키가 없습니다.')
    const model = settings.transcribe.model
    const base64 = Buffer.from(audioBuffer).toString('base64')
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [
                { text: '이 오디오를 한국어로 정확히 전사해주세요. 말한 내용만 출력하세요.' },
                { inline_data: { mime_type: mimeType, data: base64 } }
            ]}]
        })
    })
    if (!res.ok) throw new Error(`Gemini transcribe error ${res.status}`)
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}
