import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'
import { Readable } from 'stream'

export const maxDuration = 60

// HTML → plain text
function htmlToText(html: string, maxChars = 1000): string {
    return html
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
        .slice(0, maxChars)
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

        const text = htmlToText(html || '')
        if (!text.trim()) return NextResponse.json({ error: '읽을 내용이 없습니다.' }, { status: 400 })

        // ── 1. OpenAI TTS → MP3 buffer ────────────────────────────
        const abortCtrl = new AbortController()
        const abortTimer = setTimeout(() => abortCtrl.abort(), 45_000)
        let ttsRes: Response
        try {
            ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'tts-1', input: text, voice: 'nova', response_format: 'mp3', speed: 1.0 }),
                signal: abortCtrl.signal,
            })
        } finally { clearTimeout(abortTimer) }

        if (!ttsRes.ok) {
            const err = await ttsRes.text()
            return NextResponse.json({ error: `OpenAI TTS 오류 (${ttsRes.status}): ${err.slice(0, 200)}` }, { status: ttsRes.status })
        }
        const mp3Buffer = Buffer.from(await ttsRes.arrayBuffer())

        // ── 2. Upload to Google Drive ─────────────────────────────
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

        // ── 3. Make file publicly readable ───────────────────────
        await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        })

        // ── 4. Save to archive_pages (upsert tts_audio_file_id) ──
        const adminSupabase = supabase  // uses user session (admin already verified)

        // Find existing archive page or insert
        let pageQuery = supabase
            .from('archive_pages')
            .select('id')
            .eq('week_number', weekNumber)
        if (courseId) pageQuery = pageQuery.eq('course_id', courseId)
        const { data: existing } = await pageQuery.maybeSingle()

        if (existing?.id) {
            await adminSupabase.from('archive_pages').update({ tts_audio_file_id: fileId }).eq('id', existing.id)
        } else {
            await adminSupabase.from('archive_pages').insert({
                week_number: weekNumber,
                course_id: courseId,
                title: `${weekNumber}주차 강의 자료`,
                content: '',
                tts_audio_file_id: fileId,
            })
        }

        return NextResponse.json({ fileId, ok: true })
    } catch (e: any) {
        console.error('[tts-to-drive]', e)
        return NextResponse.json({ error: e.message || '처리 실패' }, { status: 500 })
    }
}
