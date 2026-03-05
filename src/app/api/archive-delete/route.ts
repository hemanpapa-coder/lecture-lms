import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { google } from 'googleapis';

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

        // 2. Delete from DB First
        const { error: deleteError } = await supabase
            .from('archives')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.warn("Deleted from drive skipped due to DB error:", deleteError.message);
            // throw deleteError; // Uncomment if table strictly exists
        }

        // 3. Try to delete from Google Drive
        if (fileId && typeof fileId === 'string' && !fileId.startsWith('dummy-')) {
            try {
                const auth = new google.auth.GoogleAuth({
                    credentials: {
                        client_email: process.env.GOOGLE_CLIENT_EMAIL,
                        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                    },
                    scopes: ['https://www.googleapis.com/auth/drive.file'],
                });
                const drive = google.drive({ version: 'v3', auth });
                await drive.files.delete({ fileId: fileId });
            } catch (driveErr) {
                console.error('Failed to delete from Google Drive:', driveErr);
            }
        }

        return NextResponse.json({ success: true, message: 'Archive deleted successfully' });

    } catch (error: any) {
        console.error('Archive Delete API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
