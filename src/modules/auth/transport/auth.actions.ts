'use server'

import { createHash, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSessionToken } from '@/lib/session'

export type LoginActionState = {
  error: string | null
}

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return { error: 'Ошибка конфигурации сервера' }

  const password = formData.get('password')
  if (typeof password !== 'string') return { error: 'Некорректная форма' }

  const hashOf = (s: string) => createHash('sha256').update(s).digest()
  const valid = timingSafeEqual(hashOf(password), hashOf(adminPassword))

  if (!valid) return { error: 'Неверный пароль' }

  const token = await createSessionToken()
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  })
  redirect('/admin')
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/admin/login')
}
