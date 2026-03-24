import { google } from 'googleapis'

export function getDriveClient() {
    // OAuth2 Refresh Token 방식 (안정적인 개인/학교 워크스페이스 용량 사용)
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

    throw new Error('Google OAuth API credentials are not set.')
}

export async function getDriveToken() {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/^["']|["']$/g, '');
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim().replace(/^["']|["']$/g, '');
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim().replace(/^["']|["']$/g, '');

    if (clientId && clientSecret && refreshToken) {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground')
        oauth2Client.setCredentials({ refresh_token: refreshToken })
        const { token } = await oauth2Client.getAccessToken()
        return token
    }
    throw new Error('Google OAuth API credentials are not set.')
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
