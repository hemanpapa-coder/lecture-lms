import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: proofs, error } = await supabase
            .from('assignments')
            .select('id, title, file_url, created_at, status')
            .eq('user_id', user.id)
            .eq('week_number', 0)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Fetch my proofs error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ proofs })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
