import { NextRequest, NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/googleDrive';
import { createClient } from '@/utils/supabase/server';

export async function GET(
    req: NextRequest,
    { params }: { params: { fileId: string } }
) {
    try {
        const fileId = params.fileId;
        if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

        // Ensure user is authenticated
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const drive = getDriveClient();

        // 1. Get metadata for Content-Type, Size, and Filename
        const metadata = await drive.files.get({
            fileId,
            fields: 'name, mimeType, size',
        });

        const { mimeType, size, name } = metadata.data;

        // 2. Fetch the actual media stream
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        const nodeStream = response.data;

        // 3. Convert Node.js stream to Web ReadableStream
        const stream = new ReadableStream({
            start(controller) {
                nodeStream.on('data', (chunk) => controller.enqueue(chunk));
                nodeStream.on('end', () => controller.close());
                nodeStream.on('error', (err) => controller.error(err));
            },
            cancel() {
                nodeStream.destroy();
            }
        });

        // 3. Forcing application/octet-stream for ALL files to ensure direct download
        // and prevent the browser from trying to preview/open the file in a new tab.
        const finalMimeType = 'application/octet-stream';

        return new Response(stream, {
            headers: {
                'Content-Type': finalMimeType,
                'Content-Length': size || '',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(name || 'file')}"; filename*=UTF-8''${encodeURIComponent(name || 'file')}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error: any) {
        console.error('Download Proxy Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
