import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// PATCH /api/archive-caption — 파일 캡션 저장 (관리자 전용)
export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: userRecord } = await supabase
            .from('users').select('role').eq('id', user.id).single();
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com';
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { id, caption } = await req.json();
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        const { error } = await supabase
            .from('archives')
            .update({ caption: caption ?? null })
            .eq('id', id);

        if (error) {
            console.error('Caption update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Archive Caption API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
