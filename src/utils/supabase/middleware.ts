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
            .select('role, profile_image_url, email, course_id, profile_completed')
            .eq('id', user.id)
            .single()

        isAdmin = userRecord?.role === 'admin' || userRecord?.email === 'hemanpapa@gmail.com'

        const isCourseSelectRoute = request.nextUrl.pathname.startsWith('/auth/select-course')
        const isProfileSetupRoute = request.nextUrl.pathname.startsWith('/auth/profile-setup')

        // Step 1: Non-admin without course → select course
        if (!isAdmin && !userRecord?.course_id && !isCourseSelectRoute && !isAuthRoute) {
            const url = request.nextUrl.clone()
            url.pathname = '/auth/select-course'
            return NextResponse.redirect(url)
        }

        // Step 2: Non-admin with course but no profile → fill profile
        if (!isAdmin && userRecord?.course_id && !userRecord?.profile_completed
            && !isProfileSetupRoute && !isCourseSelectRoute && !isAuthRoute) {
            const url = request.nextUrl.clone()
            url.pathname = '/auth/profile-setup'
            return NextResponse.redirect(url)
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
