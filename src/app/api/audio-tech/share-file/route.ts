import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    try {
        // Authenticate user
        const serverSupabase = await createServerClient();
        const { data: { user } } = await serverSupabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { filesInfo, courseId } = body;
        // filesInfo: { name: string, url: string, size: number, fileId: string }[]

        if (!courseId || !Array.isArray(filesInfo)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Use service role key to bypass RLS on `archives`
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const adminSupabase = createClient(supabaseUrl, supabaseKey);

        const insertData = filesInfo.map((f: any) => ({
            title: f.name,
            file_id: f.fileId || '',
            file_url: f.url,
            file_size: f.size || 0,
            uploaded_by: user.id,
            week_number: 999, // Magic number for Shared Files
            course_id: courseId
        }));

        const { error } = await adminSupabase.from('archives').insert(insertData);

        if (error) throw error;

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Share file error:', e);
        return NextResponse.json({ error: e.message || '저장 실패' }, { status: 500 });
    }
}
