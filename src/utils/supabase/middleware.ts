import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next();
  // Firebase session is handled via cookies manually, so the middleware 
  // just ensures the cookie exists for protected routes.
  
  const session = request.cookies.get('firebase-session');
  
  // Basic route protection mock
  if (request.nextUrl.pathname.startsWith('/admin') && !session) {
      return NextResponse.redirect(new URL('/', request.url));
  }
  
  if (request.nextUrl.pathname.startsWith('/workspace') && !session) {
      return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}
