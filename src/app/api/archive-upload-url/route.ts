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

        // -- DIAGNOSTIC START --
        const missingVars = [];
        if (!process.env.GOOGLE_CLIENT_ID) missingVars.push('GOOGLE_CLIENT_ID');
        if (!process.env.GOOGLE_CLIENT_SECRET) missingVars.push('GOOGLE_CLIENT_SECRET');
        if (!process.env.GOOGLE_REFRESH_TOKEN) missingVars.push('GOOGLE_REFRESH_TOKEN');

        if (missingVars.length > 0) {
            throw new Error(`환경변수 누락 (v5): Vercel에 [${missingVars.join(', ')}] 설정이 되어있지 않습니다. 설정 후 배포를 다시 해주세요.`);
        }
        // -- DIAGNOSTIC END --

        // 1. Get Unified Drive Client
        const drive = getDriveClient();
        const authClient = (drive.context as any)._options.auth;

        if (!authClient || typeof authClient.getAccessToken !== 'function') {
            throw new Error('Google Drive 인증 객체 생성 실패 (v5). GOOGLE_REFRESH_TOKEN 등이 올바른지 확인해주세요.');
        }

        // 2. Get Access Token with explicit error reporting
        let token: string | null = null;
        try {
            const authResponse = await authClient.getAccessToken();
            token = authResponse.token;
        } catch (e: any) {
            console.error('Google OAuth2 Token refresh failed (v5):', e);
            throw new Error(`구글 인증 오류 (v5: ${e.message}). ID, Secret, Refresh Token이 서로 일치하는지 확인이 필요합니다.`);
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
