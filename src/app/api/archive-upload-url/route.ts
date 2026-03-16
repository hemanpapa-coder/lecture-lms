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

        // 1. Get Unified Drive Client
        const drive = getDriveClient();
        const authClient = (drive.context as any)._options.auth;

        // 2. STAGE 1 & 2: Initiate Resumable Upload Session directly
        // V8 Strategy: 기존의 '빈 파일 생성 후 URL 요청'은 Service Account의 0바이트 할당량 정책에 의해 차단됨.
        // 대신 Google Drive API의 기본 /upload/ URL에 metadata를 포함하여 POST 요청을 보내 세션 URL만 받아옴.
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        
        const fileMetadata = {
            name: fileName,
            parents: folderId ? [folderId] : [],
        };
        
        const tokenResponse = await authClient.getAccessToken();
        const token = (tokenResponse && typeof tokenResponse === 'object') ? (tokenResponse as any).token : tokenResponse;
        if (!token) throw new Error('Access Token 발급 실패 (Token Response: ' + JSON.stringify(tokenResponse) + ')');

        const initRes = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': mimeType,
                    'X-Upload-Content-Length': String(fileSize),
                },
                body: JSON.stringify(fileMetadata)
            }
        );

        if (!initRes.ok) {
            const errText = await initRes.text();
            throw new Error(`Google Upload Session Init Failed (Direct POST): ${errText}`);
        }

        const uploadUrl = initRes.headers.get('Location');
        if (!uploadUrl) throw new Error('No upload URL returned from Google');
        
        // Note: 이 방식은 선행 fileId를 반환하지 않습니다. (업로드가 완료되어야 fileId가 반환됨)
        // WeekPageClient 측 수정 최소화를 위해 임시 fileId(또는 null) 반환 후 클라이언트 전송 완료 응답에서 fileId 추출 권장
        const fileId = "pending_upload"; 

        // Return BOTH File ID and Upload URL
        return NextResponse.json({ fileId, uploadUrl });

    } catch (error: any) {
        console.error('Archive Upload URL API Error (v8):', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
