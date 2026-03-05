import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: userRecord } = await supabase
            .from('users').select('role').eq('id', user.id).single();
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { fileId, title, fileSize, weekNumber } = await req.json();
        if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

        // 1. Get OAuth2 Client (Same as upload URL generator)
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Set permission: anyone with link can view
        await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        });

        // Get the web view link
        const fileData = await drive.files.get({
            fileId,
            fields: 'id, webViewLink',
        });

        const fileUrl = fileData.data.webViewLink;

        // Save to Supabase archives table
        const { error: dbError } = await supabase.from('archives').insert({
            title: title || fileId,
            file_id: fileId,
            file_url: fileUrl,
            file_size: fileSize || 0,
            uploaded_by: user.id,
            week_number: weekNumber ? parseInt(weekNumber) : null,
        });

        if (dbError) {
            console.warn('DB Insert Warning:', dbError.message);
        }

        return NextResponse.json({ success: true, file_id: fileId, url: fileUrl });

    } catch (error: any) {
        console.error('Archive Save Metadata API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
