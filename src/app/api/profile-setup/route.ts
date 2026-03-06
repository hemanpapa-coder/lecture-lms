import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json()
        const { department, student_id, grade, phone, major } = body

        if (!department || !student_id || !grade || !phone || !major) {
            return NextResponse.json({ error: '모든 항목을 입력해 주세요.' }, { status: 400 })
        }

        // --- MERGE LOGIC START ---
        // 1. Check if there's another user record with the same student_id or email
        // (excluding the current user)
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, email, student_id')
            .or(`student_id.eq.${student_id},email.eq.${user.email}`)
            .neq('id', user.id)
            .maybeSingle()

        if (existingUser) {
            const oldId = existingUser.id
            const newId = user.id

            // 2. Transfer all related data to the new auth-linked ID
            const tablesToMigrate = [
                { table: 'assignments', column: 'user_id' },
                { table: 'evaluations', column: 'user_id' },
                { table: 'peer_reviews', column: 'reviewer_id' },
                { table: 'research_uploads', column: 'user_id' },
                { table: 'portfolio_reviews', column: 'reviewer_id' },
                { table: 'portfolio_reviews', column: 'reviewee_id' }
            ]

            for (const { table, column } of tablesToMigrate) {
                await supabase
                    .from(table)
                    .update({ [column]: newId })
                    .eq(column, oldId)
            }

            // 3. Delete the old redundant roster record
            await supabase.from('users').delete().eq('id', oldId)
        }
        // --- MERGE LOGIC END ---

        const { error } = await supabase
            .from('users')
            .update({
                department,
                student_id,
                grade: parseInt(grade),
                phone,
                major,
                profile_completed: true,
                is_approved: false, // Reset/Ensure approval is required for the new consolidated account
            })
            .eq('id', user.id)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
