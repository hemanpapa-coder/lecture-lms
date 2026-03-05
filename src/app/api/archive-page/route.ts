import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET: Fetch a single archive page by week number
export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const week = searchParams.get('week');
    const courseId = searchParams.get('courseId');
    if (!week) return NextResponse.json({ error: 'week is required' }, { status: 400 });

    let query = supabase.from('archive_pages').select('*').eq('week_number', parseInt(week));
    if (courseId) query = query.eq('course_id', courseId);

    const { data, error } = await query.single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ page: data });
}

// POST: Save page content (Admin only)
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single();
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { week_number, title, content, course_id } = await req.json();

    const payload: any = { week_number, title, content, updated_at: new Date().toISOString() };
    if (course_id) payload.course_id = course_id;

    // Use specific conflict target constraint name or columns
    const { error } = await supabase
        .from('archive_pages')
        .upsert(payload, { onConflict: 'course_id,week_number' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
