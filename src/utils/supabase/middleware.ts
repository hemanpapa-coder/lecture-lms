import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const pathname = request.nextUrl.pathname

  // 로그인/인증 콜백과 API 라우트는 각 라우트가 직접 인증을 처리한다.
  // 미들웨어에서 매번 Supabase 네트워크 호출을 추가하면 Vercel 첫 응답이 느려진다.
  const isPublicPath =
    pathname.startsWith('/auth/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/auth/qr') ||
    pathname.startsWith('/api/')

  if (isPublicPath) {
    return supabaseResponse
  }

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

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // 주의: supabaseResponse를 반드시 반환해야 합니다.
  // 쿠키가 올바르게 전달되지 않으면 세션이 끊깁니다.
  return supabaseResponse
}
