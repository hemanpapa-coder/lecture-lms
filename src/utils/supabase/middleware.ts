import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 주의: createServerClient와 getUser() 사이에 로직을 추가하지 마세요.
  // 세션이 임의로 만료되는 문제가 생길 수 있습니다.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // 인증이 필요 없는 경로 (로그인/콜백 페이지)
  const isPublicPath =
    pathname.startsWith('/auth/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/auth/qr') ||
    pathname.startsWith('/api/auth/')

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // 주의: supabaseResponse를 반드시 반환해야 합니다.
  // 쿠키가 올바르게 전달되지 않으면 세션이 끊깁니다.
  return supabaseResponse
}
