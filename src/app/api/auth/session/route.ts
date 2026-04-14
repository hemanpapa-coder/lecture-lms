import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();
    
    // Set session expiration to 5 days.
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    
    fs.appendFileSync('auth-debug.log', `[${new Date().toISOString()}] Received idToken, generating session...\n`);
    
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
    
    fs.appendFileSync('auth-debug.log', `[${new Date().toISOString()}] Session cookie generated and set.\n`);
    
    return response;
  } catch (error: any) {
    console.error('Session creation error:', error);
    fs.appendFileSync('auth-debug.log', `[${new Date().toISOString()}] Session Error: ${error.message}\n${error.stack}\n`);
    return NextResponse.json({ error: 'Unauthorized Request' }, { status: 401 });
  }
}
