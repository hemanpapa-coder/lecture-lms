/**
 * 통합 AI 프로바이더 라이브러리
 * 
 * 지원 프로바이더:
 *  - gemini  : Google Gemini (기본값, 유료)
 *  - groq    : Groq Cloud (무료, 텍스트 전용)
 *  - openai  : OpenAI GPT + Whisper (유료, 저렴)
 * 
 * 기능별 기본 프로바이더:
 *  - text       : openai (변경 가능)
 *  - vision     : gemini (이미지 읽기, 변경 가능)
 *  - transcribe : openai (음성→텍스트, 변경 가능)
 *  - image_gen  : openai (실패 시 Neuracoust/기타 폴백)
 *  - tts        : openai (텍스트→음성, 변경 가능)
 */

import { createClient } from '@supabase/supabase-js'
import { callAiRouterChat } from '@/lib/ai-router'

// ─── 타입 ────────────────────────────────────────────────────────────
export type AiCategory = 'text' | 'vision' | 'transcribe' | 'image_gen' | 'tts'
export type AiProvider = 'router' | 'gemini' | 'groq' | 'openai' | 'deepseek' | 'disabled'

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

const OPENAI_TEXT_MODEL_DEFAULT = process.env.OPENAI_TEXT_MODEL || 'gpt-5.1'

function normalizeOpenAITextModel(model?: string): string {
    const normalized = (model || '').trim()
    const alias = normalized.toLowerCase().replace(/\s+/g, '-')
    if (
        !normalized ||
        alias === 'gpt-5.5' ||
        alias === 'gpt-5.4' ||
        alias === 'gpt-5.4-mini' ||
        alias === '5.4-mini'
    ) return OPENAI_TEXT_MODEL_DEFAULT
    return normalized
}

// ─── 기본값 ──────────────────────────────────────────────────────────
export const AI_CATEGORY_DEFAULTS: Record<AiCategory, { provider: AiProvider; model: string; label: string }> = {
    text:       { provider: 'openai', model: OPENAI_TEXT_MODEL_DEFAULT, label: 'AI 채팅 / 평가 / 리포트' },
    vision:     { provider: 'gemini', model: 'gemini-2.0-flash',      label: '이미지 인식 (출석부 OCR 등)' },
    transcribe: { provider: 'openai', model: 'whisper-1',             label: '음성 → 텍스트 전사' },
    image_gen:  { provider: 'openai', model: 'gpt-image-1',            label: '이미지 생성' },
    tts:        { provider: 'openai', model: 'gpt-4o-mini-tts',        label: '텍스트 → 음성 합성' },
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
    fast:    OPENAI_TEXT_MODEL_DEFAULT,
    default: OPENAI_TEXT_MODEL_DEFAULT,
    smart:   OPENAI_TEXT_MODEL_DEFAULT,
    transcribe: 'whisper-1',
    tts:     'gpt-4o-mini-tts',
    vision:  OPENAI_TEXT_MODEL_DEFAULT,
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
                    result[cat] = {
                        provider: parsed.provider,
                        model: parsed.provider === 'openai' && cat !== 'image_gen' ? normalizeOpenAITextModel(parsed.model) : parsed.model,
                    }
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
        case 'gemini':    return process.env.GEMINI_API_KEY || process.env.GEMINI_IMAGE_KEY || ''
        case 'router':    return process.env.AI_ROUTER_API_KEY || process.env.REMOTE_API_KEY || process.env.GEMMA_API_KEY || ''
        case 'groq':      return process.env.GROQ_API_KEY || ''
        case 'openai':    return process.env.OPENAI_API_KEY || ''
        case 'deepseek':  return process.env.DEEPSEEK_API_KEY || ''
        default:          return ''
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

    let primaryError: any = null;

    try {
        if (provider === 'router') {
            return await generateTextRouter(messages, { temperature, maxTokens, jsonMode, systemPrompt }, forceModel)
        }
        if (provider === 'groq') {
            return await generateTextGroq(messages, { temperature, maxTokens, jsonMode, systemPrompt }, forceModel)
        }
        if (provider === 'openai') {
            return await generateTextOpenAI(messages, { temperature, maxTokens, jsonMode, systemPrompt }, forceModel)
        }
        // default: gemini
        const model = forceModel || settings.text.model
        return await generateTextGemini(messages, { temperature, maxTokens, jsonMode, systemPrompt }, model)
    } catch (error: any) {
        primaryError = error;
        console.warn(`[AI Fallback] Primary provider (${provider}) failed:`, error.message);
    }

    // ─── 1차 Fallback: OpenAI ───
    if (provider !== 'openai' && getApiKey('openai')) {
        try {
            console.log(`[AI Fallback] Switching to OpenAI (${OPENAI_MODELS.default})...`);
            return await generateTextOpenAI(messages, { temperature, maxTokens, jsonMode, systemPrompt }, OPENAI_MODELS.default)
        } catch (openaiError: any) {
            console.warn(`[AI Fallback] OpenAI fallback failed:`, openaiError.message);
        }
    }

    // ─── 2차 Fallback: Gemini ───
    if (provider !== 'gemini' && getApiKey('gemini')) {
        try {
            console.log(`[AI Fallback] Switching to Gemini (gemini-2.0-flash)...`);
            return await generateTextGemini(messages, { temperature, maxTokens, jsonMode, systemPrompt }, 'gemini-2.0-flash')
        } catch (geminiError: any) {
            console.warn(`[AI Fallback] Gemini fallback failed:`, geminiError.message);
        }
    }

    // 모든 프로바이더 실패 시 최초 에러 반환
    throw new Error(`모든 AI 프로바이더가 응답하지 않습니다. (최초 에러: ${primaryError?.message})`);
}

async function generateTextRouter(messages: AiMessage[], opts: AiTextOptions, forceModel?: string): Promise<string> {
    const systemFromMessages = messages.find(m => m.role === 'system')?.content || ''
    const prompt = messages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'assistant' ? 'assistant' : 'user'}: ${m.content}`)
        .join('\n\n')

    return callAiRouterChat({
        systemPrompt: opts.systemPrompt || systemFromMessages,
        prompt,
        model: forceModel && forceModel !== 'auto' ? forceModel : undefined,
        allowHeavy: (opts.maxTokens ?? 4096) > 4096,
        jsonMode: opts.jsonMode,
    })
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

    const model = normalizeOpenAITextModel(forceModel || OPENAI_MODELS.default)
    const msgs = opts.systemPrompt
        ? [{ role: 'system', content: opts.systemPrompt }, ...messages.filter(m => m.role !== 'system')]
        : messages

    const isGpt5 = model.startsWith('gpt-5')
    const body: any = {
        model,
        messages: msgs,
        ...(isGpt5
            ? { max_completion_tokens: opts.maxTokens ?? 4096 }
            : { temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 4096 }),
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
    let model = settings.vision.model
    if (model === 'gemini-1.5-flash') model = 'gemini-2.0-flash' // legacy model fallback

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

    if (provider === 'deepseek') {
        const key = getApiKey('deepseek')
        if (!key) throw new Error('DeepSeek API 키가 없습니다.')
        const model = settings.transcribe.model.startsWith('deepseek') ? settings.transcribe.model : 'deepseek-v4-flash'
        const format = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'mp4' : 'mp3'
        const base64 = Buffer.from(audioBuffer).toString('base64')
        const res = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: '이 오디오를 한국어로 정확히 전사해주세요. 말한 내용만 출력하세요.' },
                        { type: 'input_audio', input_audio: { data: base64, format } },
                    ],
                }],
                temperature: 0.1,
                max_tokens: 8192,
            }),
        })
        if (!res.ok) throw new Error(`DeepSeek transcribe error ${res.status}`)
        const data = await res.json()
        return data?.choices?.[0]?.message?.content?.trim() || ''
    }

    // default: gemini (레거시 설정 호환)
    const key = getApiKey('gemini')
    if (!key) throw new Error('Gemini API 키가 없습니다.')
    let model = settings.transcribe.model
    if (model === 'gemini-1.5-flash') model = 'gemini-2.0-flash' // legacy fallback
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
