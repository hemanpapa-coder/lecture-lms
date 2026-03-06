import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing research ID' }, { status: 400 });
        }

        // 2. Fetch research to verify ownership or admin status
        const { data: research, error: fetchError } = await supabase
            .from('research_uploads')
            .select('user_id')
            .eq('id', id)
            .single();

        if (fetchError || !research) {
            return NextResponse.json({ error: 'Research material not found' }, { status: 404 });
        }

        const { data: userRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        const isRealAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';

        // Only owner or admin can delete
        if (research.user_id !== user.id && !isRealAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 3. SOFT DELETE: Mark deleted_at instead of hard delete
        const { error: deleteError } = await supabase
            .from('research_uploads')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (deleteError) {
            throw deleteError;
        }

        return NextResponse.json({ success: true, message: 'Moved to Recycle Bin' });

    } catch (error: any) {
        console.error('Research Delete API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
