import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data: evaluations, error } = await supabase.from('evaluations').select('*').limit(1)
    if (error) {
        console.error("evaluations error:", error)
    } else {
        console.log("evaluations columns:", evaluations && evaluations.length > 0 ? Object.keys(evaluations[0]) : "table exists but empty")
    }

    const { data: peer_reviews, error: pr_error } = await supabase.from('peer_reviews').select('*').limit(1)
    if (pr_error) {
        console.error("peer_reviews error:", pr_error)
    } else {
        console.log("peer_reviews columns:", peer_reviews && peer_reviews.length > 0 ? Object.keys(peer_reviews[0]) : "table exists but empty")
    }

    const { data: final_evaluations, error: fe_error } = await supabase.from('final_evaluations').select('*').limit(1)
    if (fe_error) {
        console.error("final_evaluations error:", fe_error)
    } else {
        console.log("final_evaluations columns:", final_evaluations && final_evaluations.length > 0 ? Object.keys(final_evaluations[0]) : "table exists but empty")
    }
}

run()
