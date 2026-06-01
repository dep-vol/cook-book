import { cookies } from 'next/headers'
import { verifySessionToken } from './session'

export async function requireAdmin(): Promise<void> {
  const store = await cookies()
  const token = store.get('session')?.value
  if (!token || !(await verifySessionToken(token))) {
    throw new Error('Unauthorized')
  }
}
