import { describe, it, expect, beforeEach } from 'vitest'
import { createSessionToken, verifySessionToken } from '@/lib/session'

describe('session helpers', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-that-is-long-enough-32c'
  })

  it('createSessionToken returns a 64-char hex string', async () => {
    const token = await createSessionToken()
    expect(token).toMatch(/^[a-f0-9]{64}$/)
  })

  it('verifySessionToken accepts a valid token', async () => {
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('verifySessionToken rejects a tampered token', async () => {
    expect(await verifySessionToken('deadbeef'.repeat(8))).toBe(false)
  })

  it('verifySessionToken rejects a non-hex string without throwing', async () => {
    expect(await verifySessionToken('not-valid!')).toBe(false)
  })

  it('two calls with the same secret produce the same token', async () => {
    const a = await createSessionToken()
    const b = await createSessionToken()
    expect(a).toBe(b)
  })
})
