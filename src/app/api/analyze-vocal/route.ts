import { NextRequest, NextResponse } from 'next/server'
import { getDriveClient } from '@/lib/googleDrive'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const maxDuration = 300 // 5 minutes

// Upload a single file to Gemini File API and return its URI
async function uploadToGemini(drive: ReturnType<typeof getDriveClient>, fileId: string, mimeType: string, fileName: string): Promise<string | null> {
    try {
        const geminiKey = process.env.GEMINI_API_KEY!
        const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
        const buffer = Buffer.from(response.data as ArrayBuffer)

        const initRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
            {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': buffer.length.toString(),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ file: { display_name: fileName } })
            }
        )
        if (!initRes.ok) return null

        const uploadUrl = initRes.headers.get('x-goog-upload-url')
        if (!uploadUrl) return null

        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
            },
            body: buffer
        })
        if (!uploadRes.ok) return null

        const uploadData = await uploadRes.json()
        return uploadData.file?.uri || null
    } catch (error) {
        console.error(`Error uploading ${fileName}:`, error)
        return null
    }
}

// Call Gemini generateContent
async function callGemini(body: object): Promise<string | null> {
    const geminiKey = process.env.GEMINI_API_KEY!
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Gemini Failed: ${err}`)
    }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { fileUrl, fileName, submissionId, submissionType } = await req.json()
        if (!fileUrl) return NextResponse.json({ error: 'Missing fileUrl' }, { status: 400 })

        // Extract Google Drive ID
        const driveIdMatch = fileUrl.match(/\/file\/d\/([^/]+)\//) || fileUrl.match(/[?&]id=([^&]+)/)
        if (!driveIdMatch) {
            return NextResponse.json({ error: '지원되지 않는 오디오 링크입니다 (Google Drive만 지원)' }, { status: 400 })
        }
        const fileId = driveIdMatch[1]

        const drive = getDriveClient()
        const ext = fileName.split('.').pop()?.toLowerCase() || 'wav'
        let mimeType = 'audio/x-wav'
        if (ext === 'mp3') mimeType = 'audio/mpeg'
        else if (ext === 'm4a') mimeType = 'audio/mp4'

        const fileUri = await uploadToGemini(drive, fileId, mimeType, fileName)
        if (!fileUri) {
            return NextResponse.json({ error: 'Gemini 오디오 파일 업로드 실패' }, { status: 500 })
        }

        const prompt = `당신은 세계적인 레코딩 스튜디오의 수석 음향/레코딩 엔지니어입니다. 
아래 오디오 파일은 학생이 과제로 제출한 보컬 전용 트랙입니다.

이 오디오 트랙을 꼼꼼하게 듣고 다음 항목들을 분석해주세요:
1. 백그라운드 노이즈 (화이트 노이즈, 험 노이즈, 전기 노이즈 유무)
2. 공간의 음향 특성 (방의 잔향, 흡음 불량으로 인한 룸 모드/리버브)
3. 마이크 테크닉 (파열음/팝핑, 치찰음, 숨소리, 마이크와의 거리 적절성)
4. 클리핑 및 레벨링 (피크가 왜곡되거나 게인이 너무 높/낮은지)

위의 관점들로 문제점을 날카롭게 분석하고, 이를 수정하기 위한 실질적이고 구체적인 조언(개선 팁)을 제시하세요. 
답변은 3~4문단의 읽기 쉬운 한국어로, 마크다운(markdown) 서식을 사용해서 작성해주세요.`;

        const body = {
            contents: [{
                role: 'user',
                parts: [
                    { fileData: { fileUri, mimeType } },
                    { text: prompt }
                ]
            }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
        }

        const diagnosis = await callGemini(body)

        // Save diagnosis to the database if a submission ID is provided
        if (submissionId && diagnosis) {
            const supabaseAdmin = createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            )

            if (submissionType === 'board') {
                // Fetch existing metadata to preserve it
                const { data: bq } = await supabaseAdmin
                    .from('board_questions')
                    .select('metadata')
                    .eq('id', submissionId)
                    .single()
                
                const newMetadata = { ...(bq?.metadata || {}), ai_feedback: diagnosis }
                const { error } = await supabaseAdmin
                    .from('board_questions')
                    .update({ metadata: newMetadata })
                    .eq('id', submissionId)
                if (error) console.error('Failed to update board metadata:', error)
            } else {
                // In assignments table, update the ai_feedback column directly
                const { error } = await supabaseAdmin
                    .from('assignments')
                    .update({ ai_feedback: diagnosis })
                    .eq('id', submissionId)
                if (error) console.error('Failed to update assignments feedback:', error)
            }
        }

        return NextResponse.json({ result: diagnosis })

    } catch (e: any) {
        console.error('Vocal Analysis Error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
