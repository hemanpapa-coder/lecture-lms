import { NextRequest, NextResponse } from 'next/server'

// Google Drive upload via Service Account
// Required Vercel env vars:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — service account email
//   GOOGLE_SERVICE_ACCOUNT_KEY    — service account private key (PEM, replace \n with actual newlines)
//   GOOGLE_DRIVE_FOLDER_ID        — the Drive folder ID to upload into

async function getAccessToken(): Promise<string> {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n')

    if (!email || !key) throw new Error('Google service account credentials not configured')

    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'RS256', typ: 'JWT' }
    const payload = {
        iss: email,
        scope: 'https://www.googleapis.com/auth/drive.file',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }

    const base64url = (obj: object) =>
        Buffer.from(JSON.stringify(obj)).toString('base64url')

    const unsigned = `${base64url(header)}.${base64url(payload)}`

    // Sign with RSA-SHA256
    const crypto = await import('crypto')
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(unsigned)
    const signature = sign.sign(key, 'base64url')

    const jwt = `${unsigned}.${signature}`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(tokenData))
    return tokenData.access_token
}

async function uploadToDrive(token: string, name: string, content: Blob | Buffer, mimeType: string, folderId: string) {
    const metadata = {
        name,
        parents: [folderId],
        mimeType,
    }

    const form = new FormData()
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    form.append('file', content instanceof Buffer ? new Blob([content], { type: mimeType }) : content, name)

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    })
    return res.json()
}

export async function POST(req: NextRequest) {
    // Check if Google Drive is configured — if not, return gracefully
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        return NextResponse.json({ skipped: true, reason: 'Google Drive not configured' })
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!folderId) {
        return NextResponse.json({ skipped: true, reason: 'GOOGLE_DRIVE_FOLDER_ID not set' })
    }

    try {
        const formData = await req.formData()
        const description = formData.get('description') as string
        const pageUrl = formData.get('pageUrl') as string
        const userName = formData.get('userName') as string
        const userEmail = formData.get('userEmail') as string
        const screenshotFile = formData.get('screenshot') as File | null

        const token = await getAccessToken()
        const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        const slug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const reportName = `ErrorReport_${slug}`

        // 1. Upload text report as .txt file
        const textContent = `🐛 에러 리포트
==================
시각: ${timestamp}
신고자: ${userName} (${userEmail})
발생 페이지: ${pageUrl}

에러 설명:
${description}
`
        const textFile = new Blob([textContent], { type: 'text/plain' })
        const textResult = await uploadToDrive(token, `${reportName}.txt`, textFile, 'text/plain', folderId)

        // 2. Upload screenshot if provided
        let screenshotResult: any = null
        if (screenshotFile && screenshotFile.size > 0) {
            const buffer = Buffer.from(await screenshotFile.arrayBuffer())
            screenshotResult = await uploadToDrive(token, `${reportName}_screenshot.png`, buffer, screenshotFile.type || 'image/png', folderId)
        }

        return NextResponse.json({
            success: true,
            driveUrl: textResult.webViewLink || null,
            textFileId: textResult.id,
            screenshotFileId: screenshotResult?.id || null,
        })
    } catch (err: any) {
        console.error('[drive-upload] error:', err)
        // Non-fatal: return 200 with error info so client doesn't block submission
        return NextResponse.json({ skipped: true, reason: err.message })
    }
}
