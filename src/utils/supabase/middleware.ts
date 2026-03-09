import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protect routes that require authentication
    const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
    const isPublicRoute = request.nextUrl.pathname === '/' || isAuthRoute

    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/login'
        return NextResponse.redirect(url)
    }

    // Admin role checking logic
    let isAdmin = false;

    if (user) {
        const { data: userRecord } = await supabase
            .from('users')
            .select('role, profile_image_url, email, course_id, private_lesson_id, profile_completed, is_approved')
            .eq('id', user.id)
            .single()

        isAdmin = userRecord?.role === 'admin' || userRecord?.email === 'hemanpapa@gmail.com'
        const isApproved = userRecord?.is_approved || false

        const isCourseSelectRoute = request.nextUrl.pathname.startsWith('/auth/select-course')
        const isProfileSetupRoute = request.nextUrl.pathname.startsWith('/auth/profile-setup')

        if (!isAdmin) {
            const isApiRoute = request.nextUrl.pathname.startsWith('/api')
            const hasCourse = !!userRecord?.course_id || !!userRecord?.private_lesson_id;
            const hasMultipleCourses = !!userRecord?.course_id && !!userRecord?.private_lesson_id;
            const activeCourseId = request.cookies.get('active_course_id')?.value

            // Step 1: Non-admin with no profile -> fill profile
            if (!userRecord?.profile_completed
                && !isProfileSetupRoute && !isAuthRoute && !isApiRoute) {
                const url = request.nextUrl.clone()
                url.pathname = '/auth/profile-setup'
                return NextResponse.redirect(url)
            }

            // Step 2: Non-admin with profile but no courses -> select course
            if (!hasCourse && !isCourseSelectRoute && !isAuthRoute && !isApiRoute) {
                const url = request.nextUrl.clone()
                url.pathname = '/auth/select-course'
                return NextResponse.redirect(url)
            }

            // Step 3: Non-admin with multiple courses but no active session cookie -> select course
            // If they have dual-enrollment but their browser dropped the cookie, force them to re-select 
            if (hasMultipleCourses && !activeCourseId && !isCourseSelectRoute && !isAuthRoute && !isApiRoute) {
                const url = request.nextUrl.clone()
                url.pathname = '/auth/select-course'
                return NextResponse.redirect(url)
            }

            // Step 4: Approved Check (Crucial for new requirement)
            // If profile is completed but not yet approved by professor,
            // restrict access to basically only the landing page (which shows 'waiting' UI)
            if (userRecord?.profile_completed && !isApproved && request.nextUrl.pathname !== '/' && !isApiRoute) {
                const url = request.nextUrl.clone()
                url.pathname = '/'
                return NextResponse.redirect(url)
            }
        }

        if (request.nextUrl.pathname.startsWith('/admin')) {
            if (!isAdmin) {
                const url = request.nextUrl.clone()
                url.pathname = '/'
                return NextResponse.redirect(url)
            }
        }

    }

    return supabaseResponse
}
