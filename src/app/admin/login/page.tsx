'use client'

import { useActionState } from 'react'
import { loginAction } from '@/modules/auth/transport/auth.actions'

const initialState = {
  error: null,
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-80">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🍳</div>
          <h1 className="text-xl font-semibold">Cook Book</h1>
          <p className="text-sm text-gray-400 mt-1">Вход для администратора</p>
        </div>
        <form action={formAction} className="bg-gray-800 rounded-lg p-6">
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
          {state.error && (
            <div className="mt-3 text-xs text-red-400 text-center border border-red-800 rounded px-3 py-2 bg-red-950/20">
              {state.error}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
