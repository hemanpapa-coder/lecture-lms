import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'
import { Readable } from 'stream'

const FILE_NAME = 'se_exam_table.json'

/** Find the Drive file ID for the exam table JSON, or null if it doesn't exist */
async function findExamFileId(drive: any): Promise<string | null> {
    const res = await drive.files.list({
        q: `name='${FILE_NAME}' and trashed=false`,
        fields: 'files(id)',
        spaces: 'drive',
    })
    return res.data.files?.[0]?.id ?? null
}

/** Admin auth check — returns null if authorized, otherwise an error response */
async function requireAdmin(supabase: any, user: any) {
    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    return isAdmin ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── GET: load exam table from Drive ──────────────────────────────────────────
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const authErr = await requireAdmin(supabase, user)
        if (authErr) return authErr

        const drive = getDriveClient()
        const fileId = await findExamFileId(drive)
        if (!fileId) return NextResponse.json({ rows: null }) // no file yet

        const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
        const chunks: Buffer[] = []
        await new Promise<void>((resolve, reject) => {
            (res.data as NodeJS.ReadableStream)
                .on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
                .on('end', resolve)
                .on('error', reject)
        })
        const rows = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
        return NextResponse.json({ rows })
    } catch (e: any) {
        console.error('[se-exam-table GET]', e)
        return NextResponse.json({ error: e.message || '로드 실패' }, { status: 500 })
    }
}

// ── POST: save exam table to Drive ───────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const authErr = await requireAdmin(supabase, user)
        if (authErr) return authErr

        const { rows } = await req.json()
        if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows 필드 필요' }, { status: 400 })

        const jsonBuffer = Buffer.from(JSON.stringify(rows, null, 2), 'utf-8')
        const drive = getDriveClient()
        const existingId = await findExamFileId(drive)

        if (existingId) {
            // Update existing file content
            await drive.files.update({
                fileId: existingId,
                media: {
                    mimeType: 'application/json',
                    body: Readable.from(jsonBuffer),
                },
            })
            return NextResponse.json({ ok: true, fileId: existingId, action: 'updated' })
        } else {
            // Create new file
            const folderId = process.env.GOOGLE_DRIVE_SYSTEM_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
            const uploadRes = await drive.files.create({
                requestBody: {
                    name: FILE_NAME,
                    mimeType: 'application/json',
                    parents: folderId ? [folderId] : [],
                },
                media: {
                    mimeType: 'application/json',
                    body: Readable.from(jsonBuffer),
                },
                fields: 'id',
            })
            const fileId = uploadRes.data.id
            return NextResponse.json({ ok: true, fileId, action: 'created' })
        }
    } catch (e: any) {
        console.error('[se-exam-table POST]', e)
        return NextResponse.json({ error: e.message || '저장 실패' }, { status: 500 })
    }
}
