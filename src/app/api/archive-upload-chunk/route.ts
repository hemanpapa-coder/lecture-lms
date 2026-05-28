import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const maxDuration = 300

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: userRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const uploadUrl = req.headers.get('x-upload-url') || ''
        const contentRange = req.headers.get('content-range') || ''
        const mimeType = req.headers.get('x-upload-content-type') || 'application/octet-stream'
        if (!uploadUrl || !contentRange) {
            return NextResponse.json({ error: 'uploadUrl and Content-Range required' }, { status: 400 })
        }

        const chunk = Buffer.from(await req.arrayBuffer())
        if (chunk.length === 0) return NextResponse.json({ error: 'empty chunk' }, { status: 400 })

        const googleRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': mimeType,
                'Content-Length': String(chunk.length),
                'Content-Range': contentRange,
            },
            body: chunk,
        })

        if (googleRes.status === 308) {
            return NextResponse.json({
                ok: true,
                done: false,
                range: googleRes.headers.get('range') || '',
            })
        }

        if (!googleRes.ok) {
            const errText = await googleRes.text().catch(() => '')
            return NextResponse.json({
                error: `Google Drive chunk upload failed (${googleRes.status})${errText ? `: ${errText.slice(0, 300)}` : ''}`,
            }, { status: googleRes.status >= 500 ? 502 : googleRes.status })
        }

        return NextResponse.json({ ok: true, done: true })
    } catch (error: unknown) {
        console.error('Archive Upload Chunk API Error:', error)
        const message = error instanceof Error ? error.message : 'chunk upload failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
