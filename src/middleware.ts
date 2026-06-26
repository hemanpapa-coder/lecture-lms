import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

const LOCAL_LMS_URL = 'https://neuracoust.tplinkdns.com/lms'

export async function middleware(request: NextRequest) {
    if (process.env.VERCEL === '1') {
        return NextResponse.redirect(LOCAL_LMS_URL, 307)
    }

    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (route handlers perform their own auth checks)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
