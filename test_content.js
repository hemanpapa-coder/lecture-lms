require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
            clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
            privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
    });
}

async function run() {
    const db = admin.firestore();
    const docs = await db.collection('archive_pages').orderBy('updated_at', 'desc').limit(1).get()
    if (!docs.empty) {
        const data = docs.docs[0].data()
        console.log("---- CONTENT DUMP ----");
        console.log(JSON.stringify(data.content, null, 2));
    }
}
run();
