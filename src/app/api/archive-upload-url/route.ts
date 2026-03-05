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

        // -- DIAGNOSTIC START (v6) --
        const checkVar = (name: string) => {
            const val = process.env[name];
            if (!val) return 'MISSING';
            const trimmed = val.trim();
            const hasQuotes = /^["']|["']$/g.test(trimmed);
            return `${trimmed.substring(0, 5)}... (len: ${val.length})${hasQuotes ? ' [QUOTES DETECTED!]' : ''}`;
        };

        const diagInfo = {
            ID: checkVar('GOOGLE_CLIENT_ID'),
            SECRET: checkVar('GOOGLE_CLIENT_SECRET'),
            TOKEN: checkVar('GOOGLE_REFRESH_TOKEN'),
        };

        if (diagInfo.ID === 'MISSING' || diagInfo.SECRET === 'MISSING' || diagInfo.TOKEN === 'MISSING') {
            throw new Error(`환경변수 누락 (v6): ID:${diagInfo.ID}, Sec:${diagInfo.SECRET}, Tok:${diagInfo.TOKEN}. Vercel 설정을 확인하세요.`);
        }
        // -- DIAGNOSTIC END --

        // 1. Get Unified Drive Client
        const drive = getDriveClient();
        const authClient = (drive.context as any)._options.auth;

        if (!authClient || typeof authClient.getAccessToken !== 'function') {
            throw new Error(`인증 객체 생성 실패 (v6). Diag: ${JSON.stringify(diagInfo)}`);
        }

        // 2. Get Access Token with explicit error reporting
        let token: string | null = null;
        try {
            const authResponse = await authClient.getAccessToken();
            token = authResponse.token;
        } catch (e: any) {
            console.error('Google OAuth2 Token refresh failed (v6):', e);
            throw new Error(`인증 실패 (v6: ${e.message}). 변수값 확인용: ${JSON.stringify(diagInfo)}`);
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
