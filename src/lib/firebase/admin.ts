import * as admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  try {
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'lms-kim.firebasestorage.app',
      });
    } else {
      return admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'lms-kim.firebasestorage.app',
      });
    }
  } catch (error: any) {
    console.error('Firebase Admin Initialization Error', error.stack);
    return null;
  }
}

const adminApp = getAdminApp();

export const adminDb = adminApp ? admin.firestore() : null;
export const adminAuth = adminApp ? admin.auth() : null;
export const adminStorage = adminApp ? admin.storage() : null;
