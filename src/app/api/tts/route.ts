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

// ── PCM → WAV 헤더 생성 (Gemini TTS는 raw PCM을 반환함) ────────────────
function createWavHeader(dataLength: number, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)                                     // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20)                                      // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28) // ByteRate
  header.writeUInt16LE(channels * (bitDepth / 8), 32)             // BlockAlign
  header.writeUInt16LE(bitDepth, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)
  return header
}

// WAV 데이터 청크 오프셋 찾기 ("data" 청크 시작 위치 + 8바이트)
function getWavDataOffset(buf: Buffer): number {
  for (let i = 12; i < buf.length - 8; i++) {
    if (buf.slice(i, i + 4).toString('ascii') === 'data') return i + 8
  }
  return 44 // fallback
}

// 텍스트를 청크로 분할 (TTS 콜 당 최대 3000자 — Vercel 60초 제한 안에 맞추기)
// 너무 긴 텍스트는 504 타임아웃 발생 → 위험 출력 대신 콜수 최소화
function splitTextChunks(text: string, maxLen = 3000): string[] {
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

// Gemini TTS 호출 → { buffer, mimeType } 반환
async function callGeminiTTS(
  text: string, model: string, apiKey: string, voiceName = 'Kore'
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    console.error(`[TTS] ${model} error ${res.status}:`, err.slice(0, 300))
    return null
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts || []

  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType: string = part.inlineData.mimeType || 'audio/L16;rate=24000'
      console.log('[TTS] mimeType from Gemini:', mimeType)
      return { buffer: Buffer.from(part.inlineData.data, 'base64'), mimeType }
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

  // Vercel 60초 제한 방지: API 1회 호출만 하도록 3000자로 제한 (~20-25초 소요)
  // 2청크 이상이면 총 50-60초 → 타임아웃 위험. 1청크로 안전하게.
  const MAX_TOTAL_CHARS = 3000
  const limitedText = plainText.length > MAX_TOTAL_CHARS
    ? plainText.slice(0, MAX_TOTAL_CHARS) + '\n\n(음성 분량 제한으로 이후 내용은 생략됩니다)'
    : plainText
  if (plainText.length > MAX_TOTAL_CHARS) {
    console.log(`[TTS] 텍스트 ${plainText.length}자 → ${MAX_TOTAL_CHARS}자로 제한 (504 방지)`)
  }

  const chunks = splitTextChunks(limitedText)
  const audioResults: { buffer: Buffer; mimeType: string }[] = []

  for (let i = 0; i < chunks.length; i++) {
    const result = await callGeminiTTS(chunks[i], ttsModel, geminiKey, voiceName)
    if (result) audioResults.push(result)
  }

  if (audioResults.length === 0) {
    return NextResponse.json({ error: 'TTS 생성 실패' }, { status: 500 })
  }

  // 오디오 형식 감지 후 합치기
  const firstMime = audioResults[0].mimeType.toLowerCase()
  const isWav = firstMime.includes('audio/wav') || audioResults[0].buffer.slice(0, 4).toString('ascii') === 'RIFF'

  let fullAudio: Buffer
  if (isWav && audioResults.length === 1) {
    // 단일 WAV 청크 → 그대로 사용
    fullAudio = audioResults[0].buffer
  } else if (isWav) {
    // 여러 WAV 청크 → 헤더 다시 생성 (Data chain)
    const sampleRate = audioResults[0].buffer.readUInt32LE(24)
    const channels   = audioResults[0].buffer.readUInt16LE(22)
    const bitDepth   = audioResults[0].buffer.readUInt16LE(34)
    const pcmParts   = audioResults.map(r => r.buffer.slice(getWavDataOffset(r.buffer)))
    const pcmData    = Buffer.concat(pcmParts)
    fullAudio = Buffer.concat([createWavHeader(pcmData.length, sampleRate, channels, bitDepth), pcmData])
    console.log(`[TTS] WAV 청크 ${audioResults.length}개 합치 → ${sampleRate}Hz ${channels}ch ${bitDepth}bit, ${pcmData.length}바이트`)
  } else {
    // Raw PCM (audio/L16 등) → WAV 헤더 추가
    const rateMatch = firstMime.match(/rate=(\d+)/)
    const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000
    const pcmData = Buffer.concat(audioResults.map(r => r.buffer))
    fullAudio = Buffer.concat([createWavHeader(pcmData.length, sampleRate, 1, 16), pcmData])
    console.log(`[TTS] PCM → WAV 헤더 추가 (${sampleRate}Hz, ${pcmData.length}바이트)`)
  }

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
