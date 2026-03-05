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

        // Optional: Check authentication if you want to restrict streaming to logged-in users
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const drive = getDriveClient();

        // 1. Get metadata to provide accurate Content-Type and Content-Length
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

        // 3. Convert the Node.js Readable stream to a Web ReadableStream for Next.js Response
        const nodeStream = response.data;

        // Use a high-performance stream piping approach
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

        return new Response(stream, {
            headers: {
                'Content-Type': mimeType || 'audio/mpeg',
                'Content-Length': size || '',
                'Content-Disposition': `inline; filename="${encodeURIComponent(name || 'audio')}"`,
                'Accept-Ranges': 'bytes', // Enable seeking in some browsers
                'Cache-Control': 'public, max-age=3600',
            },
        });

    } catch (error: any) {
        console.error('Archive Streaming Proxy Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
