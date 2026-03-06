import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (userRecord?.role !== 'admin' && user.email !== 'hemanpapa@gmail.com') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch deleted archives, assignments, and research_uploads
        const [archives, assignments, research] = await Promise.all([
            supabase.from('archives').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
            supabase.from('assignments').select('*, users(name)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
            supabase.from('research_uploads').select('*, users(name)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
        ]);

        return NextResponse.json({
            archives: archives.data || [],
            assignments: assignments.data || [],
            research: research.data || [],
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { action, type, id } = await req.json();

        if (action === 'restore') {
            const { error } = await supabase.from(type).update({ deleted_at: null }).eq('id', id);
            if (error) throw error;
            return NextResponse.json({ success: true });
        } else if (action === 'purge') {
            const { error } = await supabase.from(type).delete().eq('id', id);
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
