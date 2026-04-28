import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const userId = searchParams.get('userId')
        const courseId = searchParams.get('courseId')

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 })
        }

        const supabase = await createClient()
        
        // 권한 확인 (admin 또는 교수)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: adminRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        if (adminRecord?.role !== 'admin' && user.email !== 'hemanpapa@gmail.com') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // 증빙서류는 week_number = 0 으로 저장됨
        let query = supabase
            .from('assignments')
            .select('id, title, file_url, created_at, status')
            .eq('user_id', userId)
            .eq('week_number', 0)
            .order('created_at', { ascending: false })

        // courseId가 있으면 필터링 (다만 과목 변경 시 증빙이 날아갈 수 있으므로 보통 userId로만 조회하는 것이 안전)
        // if (courseId) {
        //     query = query.eq('course_id', courseId)
        // }

        const { data: proofs, error } = await query

        if (error) {
            console.error('Fetch proofs error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ proofs })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function PUT(request: Request) {
    try {
        const { id, status } = await request.json()

        if (!id || !status) {
            return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
        }

        const supabase = await createClient()
        
        // 권한 확인 (admin 또는 교수)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: adminRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        if (adminRecord?.role !== 'admin' && user.email !== 'hemanpapa@gmail.com') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const { error } = await supabase
            .from('assignments')
            .update({ status })
            .eq('id', id)
            .eq('week_number', 0)

        if (error) {
            console.error('Update proof status error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ ok: true })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
