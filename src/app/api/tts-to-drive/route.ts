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

// 텍스트를 최대 maxLen 자 단위로 문장 경계에서 분할 (OpenAI TTS 최대 4096자)
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

// 단일 청크 TTS 생성 (최대 3회 재시도)
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
        const openaiKey = process.env.OPENAI_API_KEY
        if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY 미설정' }, { status: 500 })

        const fullText = htmlToText(html || '')
        if (!fullText.trim()) return NextResponse.json({ error: '읽을 내용이 없습니다.' }, { status: 400 })

        console.log(`[TTS] 텍스트 길이: ${fullText.length}자`)

        // ── 1. 텍스트를 4000자 청크로 분할 ──────────────────────────────────
        const chunks = splitText(fullText, 4000)
        console.log(`[TTS] 청크 수: ${chunks.length}`)

        // ── 2. 청크 3개씩 병렬 처리 (순서 보존) ─────────────────────────────
        const PARALLEL = 3
        const orderedBuffers: Buffer[] = new Array(chunks.length)

        for (let i = 0; i < chunks.length; i += PARALLEL) {
            const batch = chunks.slice(i, i + PARALLEL)
            const batchResults = await Promise.all(
                batch.map((chunk, j) => generateTtsChunk(chunk, openaiKey, i + j, chunks.length))
            )
            batchResults.forEach((buf, j) => { orderedBuffers[i + j] = buf })
            console.log(`[TTS] 배치 ${Math.floor(i / PARALLEL) + 1} 완료 (${i + batch.length}/${chunks.length}청크)`)
        }

        // ── 3. MP3 버퍼 병합 ─────────────────────────────────────────────────
        const mp3Buffer = Buffer.concat(orderedBuffers)
        console.log(`[TTS] 총 MP3 크기: ${(mp3Buffer.length / 1024).toFixed(0)}KB`)

        // ── 4. Google Drive 업로드 ────────────────────────────────────────────
        const drive = getDriveClient()
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
        const fileName = `TTS_${weekNumber}주차_${Date.now()}.mp3`

        const uploadRes = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: 'audio/mpeg',
                parents: folderId ? [folderId] : [],
            },
            media: {
                mimeType: 'audio/mpeg',
                body: Readable.from(mp3Buffer),
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

        console.log(`[TTS] 완료: fileId=${fileId}, 청크=${chunks.length}`)
        return NextResponse.json({ fileId, ok: true, chunks: chunks.length })
    } catch (e: any) {
        console.error('[tts-to-drive]', e)
        return NextResponse.json({ error: e.message || '처리 실패' }, { status: 500 })
    }
}
