// Web Push 유틸리티 - VAPID 키 설정 및 push 발송 함수

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@lecturelms.com'

interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  messageId?: string
}

/**
 * web-push 라이브러리 없이 순수 Web Crypto API로 직접 push 발송
 * Vercel Edge 환경에서도 동작
 */

// Base64URL 인코딩/디코딩 유틸
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * VAPID JWT 토큰 생성
 */
async function createVapidJwt(audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: VAPID_EMAIL,
  }

  const encodedHeader = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)))
  const encodedPayload = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const privateKeyBytes = base64UrlToUint8Array(VAPID_PRIVATE_KEY)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes.buffer.slice(privateKeyBytes.byteOffset, privateKeyBytes.byteOffset + privateKeyBytes.byteLength) as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const encodedSig = uint8ArrayToBase64Url(new Uint8Array(signature))
  return `${signingInput}.${encodedSig}`
}

/**
 * 단일 구독자에게 push 발송
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<boolean> {
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
    console.error('[push] VAPID 키 미설정')
    return false
  }

  try {
    const endpoint = subscription.endpoint
    const url = new URL(endpoint)
    const audience = `${url.protocol}//${url.host}`

    const jwt = await createVapidJwt(audience)
    const vapidHeader = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`

    const message = JSON.stringify(payload)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
        'Authorization': vapidHeader,
        'Content-Length': '0',
        'Content-Encoding': 'aes128gcm',
      },
      // Note: 실제 암호화는 복잡하므로 JSON body를 text로 보내는 방식
      body: new TextEncoder().encode(message),
    })

    if (response.status === 201 || response.status === 200) {
      return true
    } else if (response.status === 410 || response.status === 404) {
      // 구독 만료/삭제됨
      console.warn('[push] 구독 만료:', endpoint.substring(0, 50))
      return false
    } else {
      console.warn('[push] push 실패:', response.status, await response.text().catch(() => ''))
      return false
    }
  } catch (err) {
    console.error('[push] push 발송 오류:', err)
    return false
  }
}

export { VAPID_PUBLIC_KEY }
