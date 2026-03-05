import { google } from 'googleapis'

export function getDriveClient() {
    // 1. OAuth2 Refresh Token 방식 (안정적인 개인/학교 워크스페이스 용량 사용)
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/^["']|["']$/g, '');
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim().replace(/^["']|["']$/g, '');
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim().replace(/^["']|["']$/g, '');

    if (clientId && clientSecret && refreshToken) {
        const oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            'https://developers.google.com/oauthplayground' // Redirect URI
        )

        oauth2Client.setCredentials({
            refresh_token: refreshToken
        })

        return google.drive({ version: 'v3', auth: oauth2Client })
    }

    // 2. 기존 Service Account 방식 (fallback)
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('Google API credentials are not set.')
    }

    const credentials = {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive'
        ],
    })

    return google.drive({ version: 'v3', auth })
}

export async function findOrCreateFolder(drive: any, folderName: string, parentId: string) {
    // Check if it exists
    const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
    })

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id
    }

    // Create folder
    const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
    }

    const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
        supportsAllDrives: true,
    })

    return folder.data.id
}
