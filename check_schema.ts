import { createClient } from './src/utils/supabase/server'

async function run() {
    const supabase = await createClient()
    const { data: columns, error } = await supabase.rpc('get_table_columns', { table_name: 'users' })
    if (error) {
        // Fallback if RPC doesn't exist: try to select deleted_at
        const { error: selectError } = await supabase.from('users').select('deleted_at').limit(1)
        if (selectError) {
          console.log('deleted_at_missing')
        } else {
          console.log('deleted_at_exists')
        }
    } else {
        const hasDeletedAt = columns.some((c: any) => c.column_name === 'deleted_at')
        console.log(hasDeletedAt ? 'deleted_at_exists' : 'deleted_at_missing')
    }
}

run()
