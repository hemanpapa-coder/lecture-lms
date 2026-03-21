import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'
import { Readable } from 'stream'

export const maxDuration = 300  // Vercel Pro: 최대 300초

// HTML → plain text (전체 텍스트, 제한 없음)
function htmlToText(html: string): string {
    // 참조자료/참고자료 섹션 이후 제거 (읽을 필요 없음)
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
function splitText(text: string, maxLen = 2500): string[] {
    const chunks: string[] = []
    let remaining = text
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) { chunks.push(remaining); break }
        // 문장 끝(. ? ! \n)에서 자르기
        let cutAt = remaining.lastIndexOf('.', maxLen)
        if (cutAt < maxLen * 0.5) cutAt = remaining.lastIndexOf('\n', maxLen)
        if (cutAt < maxLen * 0.5) cutAt = maxLen
        chunks.push(remaining.slice(0, cutAt + 1).trim())
        remaining = remaining.slice(cutAt + 1).trim()
    }
    return chunks.filter(c => c.length > 0)
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

        // ── 1. 텍스트를 2500자 청크로 분할 → 순서대로 TTS 생성 ──────────────
        const chunks = splitText(fullText, 2500)
        const mp3Buffers: Buffer[] = []

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]
            const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'tts-1', input: chunk, voice: 'nova', response_format: 'mp3', speed: 1.0 }),
            })
            if (!ttsRes.ok) {
                const err = await ttsRes.text()
                return NextResponse.json({ error: `OpenAI TTS 청크 ${i + 1}/${chunks.length} 실패 (${ttsRes.status}): ${err.slice(0, 200)}` }, { status: ttsRes.status })
            }
            mp3Buffers.push(Buffer.from(await ttsRes.arrayBuffer()))
        }

        // ── 2. 청크 MP3 버퍼 병합 ──────────────────────────────────────────
        const mp3Buffer = Buffer.concat(mp3Buffers)

        // ── 3. Upload to Google Drive ─────────────────────────────────────
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

        // ── 4. Make file publicly readable ───────────────────────────────
        await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        })

        // ── 5. Save to archive_pages (upsert tts_audio_file_id) ──────────
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

        return NextResponse.json({ fileId, ok: true, chunks: chunks.length })
    } catch (e: any) {
        console.error('[tts-to-drive]', e)
        return NextResponse.json({ error: e.message || '처리 실패' }, { status: 500 })
    }
}
