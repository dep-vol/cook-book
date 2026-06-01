'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginAction } from '@/app/actions/auth.actions'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const password = (e.currentTarget.elements.namedItem('password') as HTMLInputElement).value
    try {
      const result = await loginAction(password)
      if ('error' in result) {
        setError(result.error)
      } else {
        router.push('/admin')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-80">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🍳</div>
          <h1 className="text-xl font-semibold">Cook Book</h1>
          <p className="text-sm text-gray-400 mt-1">Вход для администратора</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6">
          <div className="mb-4">
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
              Пароль
            </label>
            <input
              name="password"
              type="password"
              required
              autoFocus
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded px-4 py-2 text-sm font-medium transition-colors"
          >
            {pending ? 'Вхожу...' : 'Войти'}
          </button>
          {error && (
            <div className="mt-3 text-xs text-red-400 text-center border border-red-800 rounded px-3 py-2 bg-red-950/20">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
