import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for admin tasks

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in env')
  process.exit(1)
}

const db = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Fetching courses...')
  const { data: courses, error: courseError } = await db.from('courses').select('id, name')
  if (courseError) {
    console.error('Error fetching courses:', courseError)
    return
  }

  const targetCourse = courses.find(c => c.name.includes('개인레슨'))
  if (!targetCourse) {
    console.error('Target course not found.')
    return
  }
  
  console.log('Found course:', targetCourse.name, '-', targetCourse.id)

  const newStudents = [
    { email: 'sungjun.ahn@neuracoust.test', name: '안성준', password: 'password123!' },
    { email: 'seansoo.cho@neuracoust.test', name: '조션수', password: 'password123!' },
  ]

  for (const s of newStudents) {
    console.log('Creating user:', s.name)
    // Create auth user
    const { data: authUser, error: authError } = await db.auth.admin.createUser({
      email: s.email,
      password: s.password,
      email_confirm: true
    })

    if (authError && authError.code !== 'email_exists' && !authError.message.includes('already been registered')) {
      console.error('Failed to create auth user', s.name, authError)
      continue
    }

    // Since we might already have the user, let's grab their ID
    const { data: findUser } = await db.from('users').select('id').eq('email', s.email).single()
    const id = authUser?.user?.id || findUser?.id

    if (!id) {
       console.error('Could not get user ID for', s.name)
       continue
    }

    // Upsert into public.users
    const { error: upsertError } = await db.from('users').upsert({
      id: id,
      name: s.name,
      email: s.email,
      role: 'user',
      course_id: targetCourse.id
    })

    if (upsertError) {
      console.error('Failed to upsert public.user', s.name, upsertError)
    } else {
      console.log('Successfully created and assigned', s.name)
    }
  }

  console.log('Done.')
}

run()
