import Link from 'next/link'
import { logoutAction } from '@/modules/auth/transport/auth.actions'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <Link href="/admin" className="font-semibold hover:opacity-80">
          🍳 Cook Book Admin
        </Link>
        <div className="flex items-center gap-5 text-sm text-gray-400">
          <Link href="/" className="hover:text-white transition-colors">← На сайт</Link>
          <form action={logoutAction}>
            <button type="submit" className="hover:text-white transition-colors">
              Выйти
            </button>
          </form>
        </div>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  )
}
