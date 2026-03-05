import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDriveClient } from '@/lib/googleDrive';
import { PassThrough } from 'stream';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: userRecord } = await supabase
            .from('users').select('role').eq('id', user.id).single();
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const title = formData.get('title') as string;
        const weekNumber = formData.get('week_number') as string;

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        // Use the same getDriveClient() as workspace uploads (OAuth2 - uses real account quota)
        const drive = getDriveClient();
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        // Stream file to Google Drive (same pattern as workspace upload - no size limit issues)
        const stream = file.stream();
        const nodeStream = new PassThrough();
        const reader = stream.getReader();
        const consumeStream = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) { nodeStream.end(); break; }
                nodeStream.write(value);
            }
        };
        consumeStream().catch(console.error);

        const driveResponse = await drive.files.create({
            requestBody: {
                name: file.name,
                parents: folderId ? [folderId] : undefined,
            },
            media: {
                mimeType: file.type || 'application/octet-stream',
                body: nodeStream,
            },
            fields: 'id, webViewLink',
        });

        const fileId = driveResponse.data.id;
        const fileUrl = driveResponse.data.webViewLink;

        if (!fileId || !fileUrl) {
            throw new Error('드라이브 업로드 후 파일 정보를 가져오지 못했습니다.');
        }

        // Set file permissions to 'Anyone with the link can view'
        await drive.permissions.create({
            fileId: fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        });

        // Save metadata to Supabase
        const { error: dbError } = await supabase.from('archives').insert({
            title: title || file.name,
            file_id: fileId,
            file_url: fileUrl,
            file_size: file.size,
            uploaded_by: user.id,
            week_number: weekNumber ? parseInt(weekNumber) : null,
        });

        if (dbError) {
            console.warn('DB Insert Warning:', dbError.message);
        }

        return NextResponse.json({ success: true, file_id: fileId, url: fileUrl });

    } catch (error: any) {
        console.error('Archive Upload API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
