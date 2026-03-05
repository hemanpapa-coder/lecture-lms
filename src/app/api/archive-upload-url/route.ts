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

        // 1. Get Unified Drive Client (Includes working OAuth2 setup from lib/googleDrive.ts)
        const drive = getDriveClient();
        const authClient = (drive.context as any)._options.auth;

        if (!authClient || typeof authClient.getAccessToken !== 'function') {
            throw new Error('Google Drive 인증 객체를 생성하지 못했습니다. GOOGLE_REFRESH_TOKEN 등 환경변수를 확인해주세요.');
        }

        // 2. Get Access Token with explicit error reporting
        let token: string | null = null;
        try {
            const authResponse = await authClient.getAccessToken();
            token = authResponse.token;
        } catch (e: any) {
            console.error('Google OAuth2 Token refresh failed (v4):', e);
            if (e.message?.includes('invalid_client')) {
                throw new Error('Google OAuth2 인증 오류 (v4: invalid_client): Vercel 환경변수의 Client ID 또는 Secret이 올바르지 않습니다.');
            }
            if (e.message?.includes('invalid_grant')) {
                throw new Error('Google OAuth2 토큰 만료 (v4: invalid_grant): GOOGLE_REFRESH_TOKEN을 새로 발급받아야 합니다.');
            }
            throw new Error(`Google Auth Error (v4): ${e.message}`);
        }

        if (!token) throw new Error('Failed to get access token from Google.');

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
