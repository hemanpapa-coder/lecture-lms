import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDriveClient } from '@/lib/googleDrive';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: userRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        const isRealAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';
        if (!isRealAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { id, fileId } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing archive ID' }, { status: 400 });
        }

        // 2. Try to delete from Google Drive first (using OAuth2)
        if (fileId && typeof fileId === 'string' && !fileId.startsWith('dummy-')) {
            try {
                const drive = getDriveClient();
                await drive.files.delete({ fileId: fileId });
            } catch (driveErr: any) {
                // If the file is already gone, we can still proceed with DB deletion
                console.error('Failed to delete from Google Drive:', driveErr.message);
            }
        }

        // 3. Delete from DB
        const { error: deleteError } = await supabase
            .from('archives')
            .delete()
            .eq('id', id);

        if (deleteError) {
            throw deleteError;
        }

        return NextResponse.json({ success: true, message: 'Archive deleted successfully' });

    } catch (error: any) {
        console.error('Archive Delete API Error (OAuth2):', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
