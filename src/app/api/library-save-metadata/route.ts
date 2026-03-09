import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDriveClient } from '@/lib/googleDrive';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: userRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { fileId, title, courseId, type, description } = await req.json();

        if (!fileId || !title || !courseId || !type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const drive = getDriveClient();

        // 1. Update the Google Drive file permissions so students can view/download
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        // The URL format can be derived from the ID, but getting webViewLink ensures it's proper
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'webViewLink',
        });
        const url = fileMetadata.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

        // 2. Insert into library_materials in Supabase
        const { error: dbError } = await supabase
            .from('library_materials')
            .insert({
                course_id: courseId,
                title: title,
                type: type, // 'book' or 'video'
                url: url,
                description: description || null
            });

        if (dbError) throw dbError;

        return NextResponse.json({ success: true, url });

    } catch (error: any) {
        console.error('Library Save Metadata API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
