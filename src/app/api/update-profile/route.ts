import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()

        // 1. Double check auth
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { profileImageUrl } = body

        if (!profileImageUrl) {
            return NextResponse.json({ error: 'Image URL is required' }, { status: 400 })
        }

        // 2. Update user record
        const { error: updateError } = await supabase
            .from('users')
            .update({ profile_image_url: profileImageUrl })
            .eq('id', user.id)

        if (updateError) throw updateError

        return NextResponse.json({ success: true, message: 'Profile image updated successfully' })

    } catch (error: any) {
        console.error('Update Profile Image API Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
