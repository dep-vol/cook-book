'use server'

import { timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSessionToken } from '@/lib/session'

export async function loginAction(password: string): Promise<{ error: string } | { success: true }> {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return { error: 'Ошибка конфигурации сервера' }

  let valid = false
  try {
    const a = Buffer.from(password)
    const b = Buffer.from(adminPassword)
    if (a.length === b.length) valid = timingSafeEqual(a, b)
  } catch {
    valid = false
  }

  if (!valid) return { error: 'Неверный пароль' }

  const token = await createSessionToken()
  const cookieStore = await cookies()
  cookieStore.set('session', token, { httpOnly: true, path: '/', sameSite: 'lax' })
  return { success: true }
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/admin/login')
}
