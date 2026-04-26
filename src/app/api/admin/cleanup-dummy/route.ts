import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const DUMMY_USER_ID = 'f60f7df2-f026-4d79-8b69-c0660315065d'
const ADMIN_EMAIL = 'hemanpapa@gmail.com'

const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE() {
    // 관리자만 허용
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== ADMIN_EMAIL) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deleted: Record<string, number> = {}

    // 1. exam_submissions
    const { data: es } = await supabaseAdmin
        .from('exam_submissions')
        .delete()
        .eq('user_id', DUMMY_USER_ID)
        .select('user_id')
    deleted.exam_submissions = es?.length ?? 0

    // 2. evaluations
    const { data: ev } = await supabaseAdmin
        .from('evaluations')
        .delete()
        .eq('user_id', DUMMY_USER_ID)
        .select('user_id')
    deleted.evaluations = ev?.length ?? 0

    // 3. assignments (과제 제출)
    const { data: as } = await supabaseAdmin
        .from('assignments')
        .delete()
        .eq('user_id', DUMMY_USER_ID)
        .select('user_id')
    deleted.assignments = as?.length ?? 0

    // 4. chat_messages
    const { data: cm } = await supabaseAdmin
        .from('chat_messages')
        .delete()
        .eq('user_id', DUMMY_USER_ID)
        .select('user_id')
    deleted.chat_messages = cm?.length ?? 0

    // 5. workspace_notes
    const { data: wn } = await supabaseAdmin
        .from('workspace_notes')
        .delete()
        .eq('user_id', DUMMY_USER_ID)
        .select('user_id')
    deleted.workspace_notes = wn?.length ?? 0

    return NextResponse.json({ success: true, deleted })
}
