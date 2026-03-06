import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Check if admin
        const { data: adminRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        const isRealAdmin = adminRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isRealAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const formData = await req.formData()
        const targetUserId = formData.get('userId') as string
        const action = formData.get('action') as string

        if (!targetUserId || !action) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        if (action === 'approve') {
            const { error } = await supabase
                .from('users')
                .update({ is_approved: true })
                .eq('id', targetUserId)

            if (error) throw error
        } else if (action === 'delete') {
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', targetUserId)

            if (error) throw error
        }

        // Redirect back to admin page
        return NextResponse.redirect(new URL('/admin?tab=students', req.url), 303)
    } catch (err: any) {
        console.error('Admin action error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
