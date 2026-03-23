import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// GET: 마감 상태 조회
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const courseId = searchParams.get('courseId')
    if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('courses')
        .select('metadata')
        .eq('id', courseId)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const deadlines: Record<string, boolean> = (data?.metadata as any)?.homework_deadlines || {}
    return NextResponse.json({ deadlines })
}

// POST: 마감 상태 토글 (관리자 전용)
export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { courseId, week, closed } = await req.json()
    if (!courseId || week === undefined) return NextResponse.json({ error: 'courseId and week required' }, { status: 400 })

    // 현재 metadata 가져오기
    const { data: course, error: fetchErr } = await supabase
        .from('courses')
        .select('metadata')
        .eq('id', courseId)
        .single()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const currentMeta = (course?.metadata as any) || {}
    const currentDeadlines = currentMeta.homework_deadlines || {}

    const updatedDeadlines = { ...currentDeadlines, [String(week)]: closed }
    const updatedMeta = { ...currentMeta, homework_deadlines: updatedDeadlines }

    const { error: updateErr } = await supabase
        .from('courses')
        .update({ metadata: updatedMeta })
        .eq('id', courseId)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, deadlines: updatedDeadlines })
}
