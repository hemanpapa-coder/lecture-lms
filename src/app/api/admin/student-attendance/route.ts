import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userRecord } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const isRealAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
    if (!isRealAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')
    const courseId = searchParams.get('courseId')

    if (!targetUserId || !courseId) {
        return NextResponse.json({ error: 'Missing userId or courseId' }, { status: 400 })
    }

    try {
        const { data, error } = await supabase
            .from('class_attendances')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('course_id', courseId)
            .order('week_number', { ascending: true })

        if (error) throw error
        return NextResponse.json({ attendances: data })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
