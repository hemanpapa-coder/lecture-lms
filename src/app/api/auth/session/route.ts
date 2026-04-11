import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();
    
    // Set session expiration to 5 days.
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    
    // Create the session cookie. This will also verify the ID token.
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
    
    // Set cookie policy
    const options = {
      name: 'firebase-session',
      value: sessionCookie,
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    };
    
    const response = NextResponse.json({ status: 'success' });
    // @ts-ignore
    response.cookies.set(options);
    
    return response;
  } catch (error: any) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Unauthorized Request' }, { status: 401 });
  }
}
