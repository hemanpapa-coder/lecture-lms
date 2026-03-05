import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()

        // 1. Double check admin privilege
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

        const body = await req.json()
        const { action } = body

        if (action === 'seed' || action === 'reset') {
            const { data, error } = await supabase.rpc('manage_dummy_data', { p_action: action })

            if (error) {
                console.error("RPC Error:", error.message)
                throw new Error(error.message)
            }

            return NextResponse.json({ success: true, message: data })
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    } catch (error: any) {
        console.error('Seed API Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
