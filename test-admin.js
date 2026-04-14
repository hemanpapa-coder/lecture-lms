const fs = require('fs');
const admin = require('firebase-admin');

async function test() {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const projectMatch = envContent.match(/FIREBASE_ADMIN_PROJECT_ID="([^"]+)"/);
    const emailMatch = envContent.match(/FIREBASE_ADMIN_CLIENT_EMAIL="([^"]+)"/);
    const keyMatch = envContent.match(/FIREBASE_ADMIN_PRIVATE_KEY="([^"]+)"/);
    
    const projectId = projectMatch ? projectMatch[1] : null;
    const clientEmail = emailMatch ? emailMatch[1] : null;
    const pk = keyMatch ? keyMatch[1] : null;

    console.log("Raw PK has \\n string?", pk && pk.includes('\\n'));
    console.log("Raw PK has actual newlines?", pk && pk.includes('\n'));
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: pk ? pk.replace(/\\n/g, '\n') : undefined,
      })
    });
    console.log("Init OK");
    console.log("app created:", admin.apps.length);
  } catch (err) {
    console.error("Init Error:", err.message);
  }
}
test();
