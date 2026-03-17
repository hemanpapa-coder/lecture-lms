import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = "1//04A_3J1BuaW4ZCgYIARAAGAQSNwF-L9Ir8hZ1IJhRA81oJs2d_7wvTf1Dht04R3SoNJwqXEl9a6FLYH3jqlvU0m8Edp0-RBawn48";
    
    console.log("clientId:", clientId ? "EXISTS" : "MISSING");
    console.log("clientSecret:", clientSecret ? "EXISTS" : "MISSING");
    
    try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const res = await oauth2Client.getAccessToken();
        console.log("Success Token:", res.token?.substring(0, 15) + "...");
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}
test();
