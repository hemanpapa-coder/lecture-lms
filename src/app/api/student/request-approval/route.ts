import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Fetch current count to increment safely
        const { data: userData, error: fetchError } = await supabase
            .from('users')
            .select('approval_request_count')
            .eq('id', user.id)
            .single()

        if (fetchError) {
            return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
        }

        const currentCount = userData?.approval_request_count || 0
        const newCount = currentCount + 1

        const { error: updateError } = await supabase
            .from('users')
            .update({
                approval_request_count: newCount,
                last_requested_at: new Date().toISOString()
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 })
        }

        return NextResponse.json({ success: true, newCount })
    } catch (err: any) {
        console.error('Request approval error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
