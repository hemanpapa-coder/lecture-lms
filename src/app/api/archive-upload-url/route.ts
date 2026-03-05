import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { google } from 'googleapis';

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

        // 1. Get OAuth2 Client (Uses real account quota via Refresh Token)
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        // 2. Get Access Token
        const { token } = await oauth2Client.getAccessToken();
        if (!token) throw new Error('Failed to get access token');

        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        // 3. Initiate Resumable Upload Session with Google Drive
        const metadata = {
            name: fileName,
            ...(folderId ? { parents: [folderId] } : {}),
        };

        const initRes = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': mimeType,
                    ...(fileSize ? { 'X-Upload-Content-Length': String(fileSize) } : {}),
                },
                body: JSON.stringify(metadata),
            }
        );

        if (!initRes.ok) {
            const errText = await initRes.text();
            throw new Error(`Google Drive session init failed: ${errText}`);
        }

        const uploadUrl = initRes.headers.get('Location');
        if (!uploadUrl) throw new Error('No upload URL returned from Google Drive');

        return NextResponse.json({ uploadUrl });

    } catch (error: any) {
        console.error('Archive Upload URL API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
