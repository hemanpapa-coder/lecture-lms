import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getDriveClient } from '@/lib/googleDrive';

export async function POST(req: NextRequest) {
    try {
        const serverSupabase = await createServerClient();
        const { data: { user } } = await serverSupabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { archiveId } = body;

        if (!archiveId) {
            return NextResponse.json({ error: 'Missing archiveId' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminSupabase = createClient(supabaseUrl, supabaseKey);

        // Fetch the record to check ownership
        const { data: archive, error: fetchError } = await adminSupabase
            .from('archives')
            .select('uploaded_by, file_id')
            .eq('id', archiveId)
            .single();

        if (fetchError || !archive) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Check if user is admin or the owner
        const { data: userRecord } = await adminSupabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';

        if (!isAdmin && archive.uploaded_by !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 1. Delete from Google Drive if file_id exists
        if (archive.file_id) {
            try {
                const drive = getDriveClient();
                await drive.files.delete({ fileId: archive.file_id });
            } catch (driveErr) {
                console.warn('Failed to delete file from Google Drive. It may have already been deleted.', driveErr);
            }
        }

        // 2. Delete from database
        const { error: deleteError } = await adminSupabase
            .from('archives')
            .delete()
            .eq('id', archiveId);

        if (deleteError) throw deleteError;

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Delete shared file error:', e);
        return NextResponse.json({ error: e.message || '삭제 실패' }, { status: 500 });
    }
}
