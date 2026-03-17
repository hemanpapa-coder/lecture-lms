import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getDriveClient } from '@/lib/googleDrive'
import { Readable } from 'stream'

export const maxDuration = 120

// HTML → 순수 텍스트 변환 (TTS용)
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, '\n\n$2\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '• $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 텍스트를 청크로 분할 (TTS 최대 5000자 제한)
function splitTextChunks(text: string, maxLen = 4500): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = start + maxLen
    if (end < text.length) {
      // 문장 경계에서 자르기
      const boundary = text.lastIndexOf('\n', end)
      if (boundary > start + maxLen * 0.5) end = boundary
    }
    chunks.push(text.slice(start, end).trim())
    start = end
  }
  return chunks.filter(c => c.length > 0)
}

// Gemini TTS 호출 → base64 오디오 반환
async function callGeminiTTS(text: string, model: string, apiKey: string, voiceName = 'Kore'): Promise<Buffer | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`[TTS] ${model} error ${res.status}:`, err.slice(0, 300))
    return null
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts || []

  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64')
    }
  }
  return null
}

// POST: TTS 변환 + Drive 업로드
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (userRow?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    html,           // 강의 노트 HTML
    title,          // 파일명용 제목
    courseId,       // 과목 ID
    weekNumber,     // 주차 번호
    ttsModel = 'gemini-2.5-flash-preview-tts',  // TTS 모델
    voiceName = 'Kore',   // Kore(여성) | Puck(남성) | Charon | Fenrir | Aoede
    driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '',
  } = body

  if (!html || !courseId || !weekNumber) {
    return NextResponse.json({ error: 'html, courseId, weekNumber required' }, { status: 400 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  // HTML → 텍스트 변환
  const plainText = htmlToText(html)
  if (plainText.length < 10) {
    return NextResponse.json({ error: '텍스트가 너무 짧습니다' }, { status: 400 })
  }

  // 청크 분할 후 TTS 호출
  const chunks = splitTextChunks(plainText)
  const audioBuffers: Buffer[] = []

  for (let i = 0; i < chunks.length; i++) {
    const buf = await callGeminiTTS(chunks[i], ttsModel, geminiKey, voiceName)
    if (buf) audioBuffers.push(buf)
  }

  if (audioBuffers.length === 0) {
    return NextResponse.json({ error: 'TTS 생성 실패' }, { status: 500 })
  }

  // 오디오 청크 합치기 (WAV 헤더 처리 없이 raw PCM이면 이어붙이기)
  const fullAudio = Buffer.concat(audioBuffers)

  // Google Drive에 업로드
  try {
    const drive = getDriveClient()

    // TTS 전용 폴더 찾기/생성
    let ttsFolderId = driveFolderId
    if (driveFolderId) {
      // 부모 폴더 내에 'TTS 오디오' 서브폴더 생성
      const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='TTS 오디오' and '${driveFolderId}' in parents and trashed=false`,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
      if (res.data.files && res.data.files.length > 0) {
        ttsFolderId = res.data.files[0].id!
      } else {
        const folder = await drive.files.create({
          requestBody: { name: 'TTS 오디오', mimeType: 'application/vnd.google-apps.folder', parents: [driveFolderId] },
          fields: 'id',
          supportsAllDrives: true,
        })
        ttsFolderId = folder.data.id!
      }
    }

    const safeTitle = (title || `Week${weekNumber} 강의`).replace(/[/\\:*?"<>|]/g, '_')
    const fileName = `[TTS] ${safeTitle}.wav`

    const parents = ttsFolderId ? [ttsFolderId] : undefined
    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'audio/wav',
        ...(parents ? { parents } : {}),
      },
      media: {
        mimeType: 'audio/wav',
        body: Readable.from(fullAudio),
      },
      fields: 'id,name,webContentLink',
      supportsAllDrives: true,
    })

    const fileId = uploadRes.data.id!

    // Drive 파일을 공개 읽기 가능하게 설정
    try {
      await drive.permissions.create({
        fileId,
        supportsAllDrives: true,
        requestBody: { role: 'reader', type: 'anyone' },
      })
    } catch {}

    // Supabase settings에 파일 ID 저장
    const settingKey = `tts_${courseId}_${weekNumber}`
    await supabase.from('settings').upsert({
      key: settingKey,
      value: JSON.stringify({
        fileId,
        fileName: uploadRes.data.name,
        model: ttsModel,
        voice: voiceName,
        createdAt: new Date().toISOString(),
        textLength: plainText.length,
      }),
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({
      ok: true,
      fileId,
      fileName: uploadRes.data.name,
      streamUrl: `/api/tts/play?fileId=${fileId}`,
    })
  } catch (err: any) {
    console.error('[TTS] Drive upload error:', err?.message)
    return NextResponse.json({ error: '드라이브 업로드 실패: ' + err?.message }, { status: 500 })
  }
}

// GET: 저장된 TTS 정보 조회
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const courseId = req.nextUrl.searchParams.get('courseId')
  const weekNumber = req.nextUrl.searchParams.get('week')

  if (!courseId || !weekNumber) {
    return NextResponse.json({ error: 'courseId, week required' }, { status: 400 })
  }

  const { data: row } = await supabase
    .from('settings')
    .select('value')
    .eq('key', `tts_${courseId}_${weekNumber}`)
    .single()

  if (!row?.value) return NextResponse.json({ tts: null })

  try {
    const ttsInfo = JSON.parse(row.value)
    return NextResponse.json({
      tts: {
        ...ttsInfo,
        streamUrl: `/api/tts/play?fileId=${ttsInfo.fileId}`,
      }
    })
  } catch {
    return NextResponse.json({ tts: null })
  }
}
