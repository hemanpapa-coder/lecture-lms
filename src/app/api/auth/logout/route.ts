import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ status: 'success' });
  
  // Clear the cookie
  // @ts-ignore
  response.cookies.set({
    name: 'firebase-session',
    value: '',
    maxAge: -1,
    path: '/',
  });
  
  return response;
}
