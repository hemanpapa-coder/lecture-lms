import { NextRequest, NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/googleDrive';
import { createClient } from '@/utils/supabase/server';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const { fileId } = await params;
        if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Removed strict 401 block so Public Archive users can view embedded images too.
        // As long as they have the fileId, they can proxy it.

        const drive = getDriveClient();

        // 1. Get metadata for Content-Type
        const metadata = await drive.files.get({
            fileId,
            fields: 'mimeType, size',
        });

        const { mimeType, size } = metadata.data;

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

        // 4. Proxy the stream inline with the correct mime-type (no content-disposition attachment)
        return new Response(stream, {
            headers: {
                'Content-Type': mimeType || 'image/jpeg', // Default to jpeg if unknown
                'Content-Length': size || '',
                'Cache-Control': 'public, max-age=86400', // Cache images for 24h to reduce Drive API quota
            },
        });

    } catch (error: any) {
        console.error('Image Proxy Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
