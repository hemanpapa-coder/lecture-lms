import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDriveClient, findOrCreateFolder } from '@/lib/googleDrive';

async function makeFilePublic(drive: any, fileId: string) {
    try {
        await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: { role: 'reader', type: 'anyone' },
        })
    } catch { /* non-fatal */ }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { fileName, mimeType, fileSize } = await req.json();
        if (!fileName || !mimeType) {
            return NextResponse.json({ error: 'fileName and mimeType required' }, { status: 400 });
        }

        const drive = getDriveClient();
        const authClient = (drive.context as any)._options.auth;

        const rootFolderId = process.env.GOOGLE_DRIVE_BOARD_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;
        if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set');

        // Create a specific folder for Q&A attachments
        const qnaFolderId = await findOrCreateFolder(drive, '익명QnA_첨부파일', rootFolderId);

        // STAGE 1: Create File Metadata first to get ID
        const fileMetadata = {
            name: fileName,
            mimeType: mimeType,
            parents: [qnaFolderId],
        };

        const file = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id, webViewLink',
            supportsAllDrives: true,
        });
        const fileId = file.data.id;
        const webViewLink = file.data.webViewLink;
        if (!fileId) throw new Error('Google Drive File ID 생성 실패');

        // Make it readable by anyone with the link
        await makeFilePublic(drive, fileId);

        // STAGE 2: Get Resumable Upload URL for this specific File ID
        const tokenResponse = await authClient.getAccessToken();
        const token = tokenResponse.token;
        if (!token) throw new Error('Access Token 발급 실패');

        const initRes = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'X-Upload-Content-Type': mimeType,
                    'X-Upload-Content-Length': String(fileSize),
                },
            }
        );

        if (!initRes.ok) {
            const errText = await initRes.text();
            throw new Error(`Google Upload Session Init Failed: ${errText}`);
        }

        const uploadUrl = initRes.headers.get('Location');
        if (!uploadUrl) throw new Error('No upload URL returned from Google');

        return NextResponse.json({ fileId, uploadUrl, webViewLink });

    } catch (error: any) {
        console.error('QnA Attachment Upload URL API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
