export async function createSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('admin'))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const expected = await createSessionToken()
    if (token.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < token.length; i++) {
      diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}
