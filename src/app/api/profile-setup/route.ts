import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { name, department, student_id, grade, phone, major, course_id } = body

        if (!name || !department || !student_id) {
            return NextResponse.json({ error: '이름, 학부/학과, 학번은 필수 항목입니다.' }, { status: 400 })
        }

        if (!course_id) {
            return NextResponse.json({ error: '과목을 선택해 주세요.' }, { status: 400 })
        }

        const updateData: Record<string, any> = {
            name,
            department,
            student_id,
            grade: grade ? parseInt(grade) : null,
            phone: phone || null,
            major: major || null,
            course_id,
            profile_completed: true,   // <-- critical: allows middleware to let user through
            is_approved: false,
        }

        // Use service role client if available (bypasses RLS which often blocks self-update)
        const dbClient = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            )
            : supabase

        // upsert instead of update - creates a row if one doesn't exist yet
        // (happens when no trigger is set up to auto-create public.users on signup)
        const { error, data: updated } = await dbClient
            .from('users')
            .upsert({
                id: user.id,
                email: user.email,
                role: 'user',
                ...updateData,
            })
            .select('id, name, course_id')

        if (error) {
            console.error('[profile-setup] update error:', error.message, error.details)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        console.log('[profile-setup] updated:', JSON.stringify(updated))

        return NextResponse.json({ success: true, updated })
    } catch (err: any) {
        console.error('[profile-setup] catch:', err.message)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
