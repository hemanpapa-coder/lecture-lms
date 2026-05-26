import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'
import { Readable } from 'stream'

export const maxDuration = 300  // Vercel Pro: 최대 300초

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

// 단일 OpenAI 청크 TTS 생성 (최대 3회 재시도)
async function generateTtsChunk(text: string, openaiKey: string, chunkIdx: number, total: number): Promise<Buffer> {
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'tts-1', input: text, voice: 'nova', response_format: 'mp3', speed: 1.0 }),
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
        if (!openaiKey && !geminiKey) return NextResponse.json({ error: 'TTS API 키 미설정' }, { status: 500 })

        const fullText = htmlToText(html || '')
        if (!fullText.trim()) return NextResponse.json({ error: '읽을 내용이 없습니다.' }, { status: 400 })

        console.log(`[TTS] 텍스트 길이: ${fullText.length}자`)

        let ttsResult: { audio: Buffer; provider: string; extension: string; mimeType: string; chunks: number }
        if (openaiKey) {
            try {
                ttsResult = await generateOpenAITts(fullText, openaiKey)
            } catch (err: any) {
                if (!geminiKey) throw err
                console.warn(`[TTS] OpenAI 실패, Gemini TTS로 우회: ${err.message}`)
                ttsResult = await generateGeminiTts(fullText, geminiKey)
            }
        } else {
            ttsResult = await generateGeminiTts(fullText, geminiKey)
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
