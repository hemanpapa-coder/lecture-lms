import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: proofs, error } = await supabase
            .from('assignments')
            .select('id, file_name, file_url, content, created_at, status')
            .eq('user_id', user.id)
            .eq('week_number', 0)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Fetch my proofs error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            proofs: (proofs || []).map((proof) => ({
                id: proof.id,
                title: proof.content && proof.content !== '(파일만 제출됨)' ? proof.content : proof.file_name,
                file_url: proof.file_url,
                created_at: proof.created_at,
                status: proof.status,
            }))
        })

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '증빙 서류 조회 실패'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
