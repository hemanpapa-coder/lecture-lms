import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId) return new Response('fileId required', { status: 400 })

  try {
    const drive = getDriveClient()
    const dlRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    )

    const buffer = Buffer.from(dlRes.data as ArrayBuffer)
    return new Response(buffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (err: any) {
    console.error('[TTS/play]', err?.message)
    return new Response('오디오를 불러올 수 없습니다', { status: 500 })
  }
}
