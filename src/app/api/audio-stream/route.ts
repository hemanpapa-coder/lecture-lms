import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

export const maxDuration = 60

export async function GET(req: NextRequest) {
    try {
        // Auth: any logged-in user can access (student or admin)
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const fileId = req.nextUrl.searchParams.get('fileId')
        if (!fileId) return NextResponse.json({ error: 'fileId 필요' }, { status: 400 })

        // Get OAuth2 access token via existing getDriveClient
        const drive = getDriveClient()
        const authClient = (drive.context as any)._options.auth
        const tokenResponse = await authClient.getAccessToken()
        const token = (tokenResponse && typeof tokenResponse === 'object') ? (tokenResponse as any).token : tokenResponse
        if (!token) throw new Error('Google OAuth 토큰 발급 실패')

        // Forward Range header if present (for audio seek support)
        const rangeHeader = req.headers.get('range')

        const driveRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(rangeHeader ? { Range: rangeHeader } : {}),
                },
            }
        )

        if (!driveRes.ok) {
            return NextResponse.json({ error: `Drive 스트리밍 실패 (${driveRes.status})` }, { status: driveRes.status })
        }

        // Build response headers
        const headers = new Headers({
            'Content-Type': driveRes.headers.get('content-type') || 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=3600',
        })
        const contentLength = driveRes.headers.get('content-length')
        if (contentLength) headers.set('Content-Length', contentLength)
        const contentRange = driveRes.headers.get('content-range')
        if (contentRange) headers.set('Content-Range', contentRange)

        return new NextResponse(driveRes.body, {
            status: driveRes.status, // 206 for Range requests
            headers,
        })
    } catch (e: any) {
        console.error('[audio-stream]', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
