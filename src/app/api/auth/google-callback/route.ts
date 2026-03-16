import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code');
    
    if (!code) {
        return NextResponse.json({ error: 'No authorization code' }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lecture-lms.vercel.app'}/api/auth/google-callback`;

    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            return NextResponse.json({ error: tokenData.error, description: tokenData.error_description }, { status: 400 });
        }

        const refreshToken = tokenData.refresh_token;

        const html = `
<!DOCTYPE html>
<html>
<head><title>OAuth 완료</title>
<style>
  body { font-family: sans-serif; max-width: 600px; margin: 80px auto; padding: 20px; background: #0a0a0a; color: #eee; }
  pre { background: #1a1a1a; padding: 20px; border-radius: 10px; word-break: break-all; white-space: pre-wrap; }
  h2 { color: #4ade80; }
  .warning { color: #fbbf24; font-size: 0.85em; }
</style>
</head>
<body>
  <h2>✅ OAuth 인증 성공!</h2>
  <p>아래 Refresh Token을 복사하여 Vercel 환경 변수 <strong>GOOGLE_REFRESH_TOKEN</strong>에 입력하세요.</p>
  <pre>${refreshToken || '(토큰이 없습니다 — prompt=consent가 없었을 수 있습니다)'}</pre>
  <p class="warning">⚠️ 이 Token은 평생 유효합니다. 절대 공개하지 마세요.</p>
  <p style="margin-top:30px; font-size:0.8em; color:#666">access_token: ${tokenData.access_token?.substring(0, 20)}...</p>
</body>
</html>`;

        return new NextResponse(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
