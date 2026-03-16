import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function check() {
    const { data: user } = await supabase.from('users').select('*').eq('email', 'hsunnyjoo@gmail.com').single()
    if (!user) {
        console.log("User not found.")
        return
    }

    const testImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...' // dummy base64
    
    console.log("Attempting to update profile_image_url...")
    const { data, error } = await supabase.from('users').update({ profile_image_url: testImg }).eq('id', user.id)
    
    if (error) {
        console.error("Update error:", error)
    } else {
        console.log("Update success!")
    }
}

check().catch(console.error)
