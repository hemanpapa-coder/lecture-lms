import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { google } from 'googleapis';
import { getDriveClient } from '@/lib/googleDrive';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: userRecord } = await supabase
            .from('users').select('role').eq('id', user.id).single();
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { fileName, mimeType, fileSize } = await req.json();
        if (!fileName || !mimeType) {
            return NextResponse.json({ error: 'fileName and mimeType required' }, { status: 400 });
        }

        // 1. Get Unified Drive Client (OAuth2)
        const drive = getDriveClient();
        const authClient = (drive.context as any)._options.auth;

        // 2. STAGE 1: Create File Metadata first to get ID (v8 strategy)
        // With OAuth2, user has actual storage quota, so this works perfectly.
        const folderId = process.env.GOOGLE_DRIVE_ARCHIVE_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;
        
        const fileMetadata = {
            name: fileName,
            mimeType: mimeType,
            parents: folderId ? [folderId] : [],
        };
        
        const file = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id',
        });
        const fileId = file.data.id;
        if (!fileId) throw new Error('Google Drive File ID 생성 실패');

        // 3. STAGE 2: Get Resumable Upload URL for this specific File ID
        const tokenResponse = await authClient.getAccessToken();
        const token = (tokenResponse && typeof tokenResponse === 'object') ? (tokenResponse as any).token : tokenResponse;
        if (!token) throw new Error('Access Token 발급 실패 (Token Response: ' + JSON.stringify(tokenResponse) + ')');

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
            throw new Error(`Google Upload Session Init Failed (OAuth2): ${errText}`);
        }

        const uploadUrl = initRes.headers.get('Location');
        if (!uploadUrl) throw new Error('No upload URL returned from Google');
        
        // Return BOTH File ID and Upload URL
        return NextResponse.json({ fileId, uploadUrl });

    } catch (error: any) {
        console.error('Archive Upload URL API Error (v8):', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
