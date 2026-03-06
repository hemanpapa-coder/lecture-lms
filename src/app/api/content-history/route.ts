import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const entityId = searchParams.get('entityId');
        const entityType = searchParams.get('entityType');

        if (!entityId || !entityType) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('content_history')
            .select('*, users(name)')
            .eq('entity_id', entityId)
            .eq('entity_type', entityType)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ history: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { historyId } = await req.json();

        // 1. Get history record
        const { data: history, error: hError } = await supabase
            .from('content_history')
            .select('*')
            .eq('id', historyId)
            .single();

        if (hError || !history) return NextResponse.json({ error: 'History not found' }, { status: 404 });

        // 2. Restore to original table
        let table = '';
        if (history.entity_type === 'archive_page') table = 'archive_pages';
        else if (history.entity_type === 'assignment_content') table = 'assignments';

        if (!table) return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });

        const { error: rError } = await supabase
            .from(table)
            .update({ content: history.content, updated_at: new Date().toISOString() })
            .eq('id', history.entity_id);

        if (rError) throw rError;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
