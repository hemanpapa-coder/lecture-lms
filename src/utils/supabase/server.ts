import { createFirestoreMockClient } from '../firestoreDbMock';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';

export async function createClient() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('firebase-session')?.value;

  let sessionUser = null;
  if (sessionCookie) {
    try {
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
      sessionUser = decodedClaims;
    } catch (error) {
      console.warn("Invalid session cookie");
    }
  }

  // Return the Mock client pre-filled with the authenticated user
  return createFirestoreMockClient(sessionUser);
}
