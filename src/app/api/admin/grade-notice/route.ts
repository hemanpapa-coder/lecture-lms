import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getAdminClient() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
        : await createClient()
}

/** GET /api/admin/grade-notice?courseId=xxx → { notice: string | null } */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const courseId = req.nextUrl.searchParams.get('courseId')
        if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

        const db = await getAdminClient()
        const { data, error } = await db
            .from('courses')
            .select('grade_notice')
            .eq('id', courseId)
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ notice: data?.grade_notice ?? null })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

/** POST /api/admin/grade-notice  body: { courseId, notice } → { success: true } */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { courseId, notice } = await req.json()
        if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

        const db = await getAdminClient()
        const { error } = await db
            .from('courses')
            .update({ grade_notice: notice ?? null })
            .eq('id', courseId)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
