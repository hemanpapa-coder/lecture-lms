import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Only admin can publish
        const { data: userRecord } = await supabase.from('users').select('role').eq('id', user.id).single()
        const isAdmin = userRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { id, publish } = await req.json()
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

        const { error } = await supabase
            .from('research_uploads')
            .update({
                is_published: publish,
                published_at: publish ? new Date().toISOString() : null,
            })
            .eq('id', id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true, published: publish })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
