import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'
import { Readable } from 'stream'
import { resolveAiRouterBaseUrl, resolveLocalAiUrl } from '@/lib/ai-router'

export const maxDuration = 300  // Vercel Pro: 최대 300초

type TtsResult = {
    audio: Buffer
    provider: string
    extension: string
    mimeType: string
    chunks: number
}

// HTML → plain text
function htmlToText(html: string): string {
    // 참조자료/참고자료 섹션 이후 제거
    const refPattern = /<h[1-6][^>]*>[^<]*(참조|참고|Reference|reference|출처|References)[^<]*<\/h[1-6]>/i
    const refMatch = refPattern.exec(html)
    const cleanedHtml = refMatch ? html.slice(0, refMatch.index) : html

    return cleanedHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<div[^>]*class="[^"]*gen-visual[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '.\n')
        .replace(/<\/li>/gi, '.\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
        .trim()
}

// 텍스트를 최대 maxLen 자 단위로 문장 경계에서 분할
function splitText(text: string, maxLen = 4000): string[] {
    const chunks: string[] = []
    let remaining = text
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) { chunks.push(remaining); break }
        let cutAt = remaining.lastIndexOf('.', maxLen)
        if (cutAt < maxLen * 0.5) cutAt = remaining.lastIndexOf('\n', maxLen)
        if (cutAt < maxLen * 0.5) cutAt = maxLen
        chunks.push(remaining.slice(0, cutAt + 1).trim())
        remaining = remaining.slice(cutAt + 1).trim()
    }
    return chunks.filter(c => c.length > 0)
}

function createWavHeader(dataLength: number, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataLength, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(channels, 22)
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28)
    header.writeUInt16LE(channels * (bitDepth / 8), 32)
    header.writeUInt16LE(bitDepth, 34)
    header.write('data', 36)
    header.writeUInt32LE(dataLength, 40)
    return header
}

function getWavDataOffset(buf: Buffer): number {
    for (let i = 12; i < buf.length - 8; i++) {
        if (buf.slice(i, i + 4).toString('ascii') === 'data') return i + 8
    }
    return 44
}

function audioExtensionFromMime(mimeType: string): string {
    const mime = mimeType.toLowerCase()
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
    if (mime.includes('wav') || mime.includes('wave') || mime.includes('l16')) return 'wav'
    if (mime.includes('ogg')) return 'ogg'
    if (mime.includes('webm')) return 'webm'
    if (mime.includes('aac')) return 'aac'
    if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
    return 'mp3'
}

function resolveRemoteTtsUrl(baseUrl?: string): string {
    const base = resolveAiRouterBaseUrl(baseUrl)
    if (base.endsWith('/api/local-ai/tts')) return base
    if (base.endsWith('/api/remote/v1/tts')) return base
    if (base.endsWith('/api/remote/v1')) return `${base}/tts`
    return resolveLocalAiUrl(base, 'tts')
}

function pickString(obj: any, paths: string[][]): string {
    for (const path of paths) {
        let cur = obj
        for (const key of path) cur = cur?.[key]
        if (typeof cur === 'string' && cur.trim()) return cur.trim()
    }
    return ''
}

function formatRemoteTtsError(status: number, raw: string): string {
    try {
        const data = JSON.parse(raw)
        const errorCode = typeof data?.error === 'string' ? data.error : data?.error?.code
        const errorMessage = typeof data?.error === 'string' ? data.error : data?.error?.message
        if (errorCode === 'tts_not_configured' || errorMessage === 'tts_not_configured') {
            return 'Neuracoust TTS 서버 설정이 아직 완료되지 않았습니다. 서버에 TTS 엔진/키/모델 설정이 필요합니다. (tts_not_configured)'
        }
        if (errorCode || errorMessage) return `Neuracoust TTS 오류 (${status}): ${[errorCode, errorMessage].filter(Boolean).join(' - ')}`
    } catch {}

    return `Neuracoust TTS 오류 (${status}): ${raw.slice(0, 200)}`
}

async function parseRemoteAudioResponse(res: Response): Promise<{ buffer: Buffer; mimeType: string }> {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.toLowerCase().startsWith('audio/')) {
        return {
            buffer: Buffer.from(await res.arrayBuffer()),
            mimeType: contentType.split(';')[0] || 'audio/mpeg',
        }
    }

    const text = await res.text()
    let data: any
    try {
        data = JSON.parse(text)
    } catch {
        throw new Error(`자체 TTS 응답이 오디오/JSON 형식이 아닙니다: ${text.slice(0, 160)}`)
    }

    if (data?.ok === false) {
        const code = data?.error?.code ? `${data.error.code}: ` : ''
        throw new Error(`자체 TTS 오류: ${code}${data?.error?.message || 'unknown error'}`)
    }

    const audioUrl = pickString(data, [
        ['audioUrl'], ['fileUrl'], ['url'], ['data', 'audioUrl'], ['data', 'fileUrl'], ['data', 'url'],
    ])
    if (audioUrl) {
        const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) })
        if (!audioRes.ok) throw new Error(`자체 TTS 오디오 URL 다운로드 실패 (${audioRes.status})`)
        return {
            buffer: Buffer.from(await audioRes.arrayBuffer()),
            mimeType: (audioRes.headers.get('content-type') || data?.mimeType || 'audio/mpeg').split(';')[0],
        }
    }

    const base64 = pickString(data, [
        ['audioBase64'], ['base64'], ['b64'], ['audio'],
        ['data', 'audioBase64'], ['data', 'base64'], ['data', 'b64'], ['data', 'audio'],
        ['audio', 'base64'], ['audio', 'data'], ['output', 'audioBase64'],
    ])
    if (!base64) throw new Error('자체 TTS 응답에 오디오 데이터가 없습니다.')

    const normalized = base64.includes(',') ? base64.split(',').pop() || '' : base64
    const mimeType = pickString(data, [
        ['mimeType'], ['contentType'], ['audio', 'mimeType'], ['data', 'mimeType'], ['output', 'mimeType'],
    ]) || (base64.startsWith('data:') ? base64.slice(5, base64.indexOf(';')) : 'audio/mpeg')

    return { buffer: Buffer.from(normalized, 'base64'), mimeType }
}

// 단일 OpenAI 청크 TTS 생성 (최대 3회 재시도)
async function generateTtsChunk(text: string, openaiKey: string, chunkIdx: number, total: number): Promise<Buffer> {
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', input: text, voice: 'nova', response_format: 'mp3', speed: 1.0 }),
            })
            if (!res.ok) {
                const err = await res.text()
                if (attempt === maxRetries) throw new Error(`청크 ${chunkIdx + 1}/${total} 실패: ${err.slice(0, 200)}`)
                console.warn(`[TTS] 청크 ${chunkIdx + 1} 시도 ${attempt} 실패 — 재시도`)
                await new Promise(r => setTimeout(r, 1000 * attempt))
                continue
            }
            return Buffer.from(await res.arrayBuffer())
        } catch (e: any) {
            if (attempt === maxRetries) throw e
            console.warn(`[TTS] 청크 ${chunkIdx + 1} 시도 ${attempt} 오류: ${e.message} — 재시도`)
            await new Promise(r => setTimeout(r, 1000 * attempt))
        }
    }
    throw new Error(`청크 ${chunkIdx + 1} 최대 재시도 초과`)
}

async function generateGeminiTtsChunk(
    text: string,
    geminiKey: string,
    chunkIdx: number,
    total: number,
    model = 'gemini-2.5-flash-preview-tts',
    voiceName = 'Kore'
): Promise<{ buffer: Buffer; mimeType: string }> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
                },
            }),
        }
    )

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Gemini TTS 청크 ${chunkIdx + 1}/${total} 실패 (${res.status}): ${err.slice(0, 200)}`)
    }

    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts || []
    const audioPart = parts.find((part: any) => part.inlineData?.data)
    if (!audioPart?.inlineData?.data) throw new Error(`Gemini TTS 청크 ${chunkIdx + 1}/${total} 음성 데이터 없음`)

    return {
        buffer: Buffer.from(audioPart.inlineData.data, 'base64'),
        mimeType: audioPart.inlineData.mimeType || 'audio/L16;rate=24000',
    }
}

function mergeGeminiAudio(results: { buffer: Buffer; mimeType: string }[]): Buffer {
    const first = results[0]
    const firstMime = first.mimeType.toLowerCase()
    const isWav = firstMime.includes('audio/wav') || first.buffer.slice(0, 4).toString('ascii') === 'RIFF'

    if (isWav && results.length === 1) return first.buffer

    if (isWav) {
        const sampleRate = first.buffer.readUInt32LE(24)
        const channels = first.buffer.readUInt16LE(22)
        const bitDepth = first.buffer.readUInt16LE(34)
        const pcmData = Buffer.concat(results.map(r => r.buffer.slice(getWavDataOffset(r.buffer))))
        return Buffer.concat([createWavHeader(pcmData.length, sampleRate, channels, bitDepth), pcmData])
    }

    const rateMatch = firstMime.match(/rate=(\d+)/)
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000
    const pcmData = Buffer.concat(results.map(r => r.buffer))
    return Buffer.concat([createWavHeader(pcmData.length, sampleRate, 1, 16), pcmData])
}

async function generateOpenAITts(fullText: string, openaiKey: string): Promise<{ audio: Buffer; provider: string; extension: string; mimeType: string; chunks: number }> {
    const chunks = splitText(fullText, 4000)
    console.log(`[TTS] OpenAI 청크 수: ${chunks.length}`)

    const PARALLEL = 3
    const orderedBuffers: Buffer[] = new Array(chunks.length)

    for (let i = 0; i < chunks.length; i += PARALLEL) {
        const batch = chunks.slice(i, i + PARALLEL)
        const batchResults = await Promise.all(
            batch.map((chunk, j) => generateTtsChunk(chunk, openaiKey, i + j, chunks.length))
        )
        batchResults.forEach((buf, j) => { orderedBuffers[i + j] = buf })
        console.log(`[TTS] OpenAI 배치 ${Math.floor(i / PARALLEL) + 1} 완료 (${i + batch.length}/${chunks.length}청크)`)
    }

    return {
        audio: Buffer.concat(orderedBuffers),
        provider: 'OpenAI TTS',
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        chunks: chunks.length,
    }
}

async function generateGeminiTts(fullText: string, geminiKey: string): Promise<{ audio: Buffer; provider: string; extension: string; mimeType: string; chunks: number }> {
    const chunks = splitText(fullText, 3000)
    console.log(`[TTS] Gemini 청크 수: ${chunks.length}`)
    const results: { buffer: Buffer; mimeType: string }[] = []

    for (let i = 0; i < chunks.length; i++) {
        results.push(await generateGeminiTtsChunk(chunks[i], geminiKey, i, chunks.length))
        console.log(`[TTS] Gemini 청크 ${i + 1}/${chunks.length} 완료`)
    }

    return {
        audio: mergeGeminiAudio(results),
        provider: 'Gemini TTS',
        extension: 'wav',
        mimeType: 'audio/wav',
        chunks: chunks.length,
    }
}

async function generateRemoteTts(fullText: string, gemmaKey: string, baseUrl: string): Promise<TtsResult> {
    const chunks = splitText(fullText, 3000)
    console.log(`[TTS] Neuracoust 청크 수: ${chunks.length}`)
    const results: { buffer: Buffer; mimeType: string }[] = []
    const endpoint = resolveRemoteTtsUrl(baseUrl)

    for (let i = 0; i < chunks.length; i++) {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${gemmaKey}`,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(90_000),
            body: JSON.stringify({
                text: chunks[i],
                input: chunks[i],
                voice: 'Kore',
                language: 'ko',
                format: 'wav',
                responseFormat: 'base64',
            }),
        })

        if (!res.ok) {
            const err = await res.text().catch(() => '')
            if (res.status === 404) {
                throw new Error(`Neuracoust TTS 엔드포인트가 아직 열려 있지 않습니다: ${endpoint}`)
            }
            throw new Error(`Neuracoust TTS 청크 ${i + 1}/${chunks.length} 실패: ${formatRemoteTtsError(res.status, err)}`)
        }

        results.push(await parseRemoteAudioResponse(res))
        console.log(`[TTS] Neuracoust 청크 ${i + 1}/${chunks.length} 완료`)
    }

    const firstMime = (results[0]?.mimeType || 'audio/mpeg').toLowerCase()
    const shouldMergeAsWav = firstMime.includes('wav') || firstMime.includes('l16') || results[0]?.buffer.slice(0, 4).toString('ascii') === 'RIFF'
    const audio = shouldMergeAsWav ? mergeGeminiAudio(results) : Buffer.concat(results.map(r => r.buffer))
    const mimeType = shouldMergeAsWav ? 'audio/wav' : (results[0]?.mimeType || 'audio/mpeg')

    return {
        audio,
        provider: 'Neuracoust TTS',
        extension: audioExtensionFromMime(mimeType),
        mimeType,
        chunks: chunks.length,
    }
}

async function resolveOpenAIKey(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
    const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'secret_openai_api_key')
        .maybeSingle()

    return (data?.value || process.env.OPENAI_API_KEY || '').trim()
}

async function resolveGeminiKey(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
    for (const key of ['secret_gemini_api_key', 'secret_gemini_image_key']) {
        const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .maybeSingle()
        const value = (data?.value || '').trim()
        if (value) return value
    }

    return (process.env.GEMINI_API_KEY || process.env.GEMINI_IMAGE_KEY || '').trim()
}

async function resolveGemmaKey(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
    for (const key of ['secret_ai_router_api_key', 'secret_remote_api_key', 'secret_gemma_api_key', 'secret_gemma_ai_key']) {
        const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .maybeSingle()
        const value = (data?.value || '').trim()
        if (value) return value
    }

    return (process.env.AI_ROUTER_API_KEY || process.env.REMOTE_API_KEY || process.env.GEMMA_API_KEY || '').trim()
}

async function resolveGemmaBaseUrl(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
    for (const key of ['ai_router_base_url', 'remote_ai_base_url', 'gemma_base_url', 'secret_gemma_base_url']) {
        const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .maybeSingle()
        const value = (data?.value || '').trim()
        if (value) return value
    }

    return (process.env.AI_ROUTER_BASE_URL || process.env.REMOTE_AI_BASE_URL || process.env.GEMMA_BASE_URL || 'https://neuracoust.tplinkdns.com').trim()
}

export async function POST(req: NextRequest) {
    try {
        // Auth check (admin only)
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { html, weekNumber, courseId } = await req.json()
        const openaiKey = await resolveOpenAIKey(supabase)
        const geminiKey = await resolveGeminiKey(supabase)
        const gemmaKey = await resolveGemmaKey(supabase)
        const gemmaBaseUrl = await resolveGemmaBaseUrl(supabase)
        if (!openaiKey && !gemmaKey && !geminiKey) {
            return NextResponse.json({ error: 'OpenAI/Neuracoust/Gemini TTS API 키 미설정' }, { status: 500 })
        }

        const fullText = htmlToText(html || '')
        if (!fullText.trim()) return NextResponse.json({ error: '읽을 내용이 없습니다.' }, { status: 400 })

        console.log(`[TTS] 텍스트 길이: ${fullText.length}자`)

        let ttsResult: TtsResult | null = null
        const ttsErrors: string[] = []

        if (openaiKey) {
            try {
                ttsResult = await generateOpenAITts(fullText, openaiKey)
            } catch (e: any) {
                ttsErrors.push(`OpenAI TTS: ${e?.message || e}`)
                console.warn('[TTS] OpenAI 실패, 다음 TTS로 전환:', e?.message || e)
            }
        }

        if (!ttsResult && gemmaKey) {
            try {
                ttsResult = await generateRemoteTts(fullText, gemmaKey, gemmaBaseUrl)
            } catch (e: any) {
                ttsErrors.push(`Neuracoust TTS: ${e?.message || e}`)
                console.warn('[TTS] Neuracoust 실패, 다음 TTS로 전환:', e?.message || e)
            }
        }

        if (!ttsResult && geminiKey) {
            try {
                ttsResult = await generateGeminiTts(fullText, geminiKey)
            } catch (e: any) {
                ttsErrors.push(`Gemini TTS: ${e?.message || e}`)
                console.warn('[TTS] Gemini 실패:', e?.message || e)
            }
        }

        if (!ttsResult) {
            throw new Error(`TTS API가 모두 실패했습니다. ${ttsErrors.map(e => e.slice(0, 180)).join(' / ')}`)
        }

        console.log(`[TTS] ${ttsResult.provider} 생성 완료: ${(ttsResult.audio.length / 1024).toFixed(0)}KB`)

        // ── 4. Google Drive 업로드 ────────────────────────────────────────────
        const drive = getDriveClient()
        const folderId = process.env.GOOGLE_DRIVE_TTS_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
        const fileName = `TTS_${weekNumber}주차_${Date.now()}.${ttsResult.extension}`

        const uploadRes = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: ttsResult.mimeType,
                parents: folderId ? [folderId] : [],
            },
            media: {
                mimeType: ttsResult.mimeType,
                body: Readable.from(ttsResult.audio),
            },
            fields: 'id',
        })
        const fileId = uploadRes.data.id
        if (!fileId) throw new Error('Google Drive 파일 ID 생성 실패')

        // ── 5. 공개 권한 설정 ─────────────────────────────────────────────────
        await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        })

        // ── 6. archive_pages에 tts_audio_file_id 저장 ────────────────────────
        let pageQuery = supabase.from('archive_pages').select('id').eq('week_number', weekNumber)
        if (courseId) pageQuery = pageQuery.eq('course_id', courseId)
        const { data: existing } = await pageQuery.maybeSingle()

        if (existing?.id) {
            await supabase.from('archive_pages').update({ tts_audio_file_id: fileId }).eq('id', existing.id)
        } else {
            await supabase.from('archive_pages').insert({
                week_number: weekNumber,
                course_id: courseId,
                title: `${weekNumber}주차 강의 자료`,
                content: '',
                tts_audio_file_id: fileId,
            })
        }

        console.log(`[TTS] 완료: fileId=${fileId}, provider=${ttsResult.provider}, 청크=${ttsResult.chunks}`)
        return NextResponse.json({ fileId, ok: true, chunks: ttsResult.chunks, provider: ttsResult.provider })
    } catch (e: any) {
        console.error('[tts-to-drive]', e)
        return NextResponse.json({ error: e.message || '처리 실패' }, { status: 500 })
    }
}
