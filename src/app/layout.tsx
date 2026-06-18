import 'reflect-metadata'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Cook Book',
  description: 'Персональная книга рецептов',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={geist.className}>
        <header className="border-b">
          <div className="container mx-auto px-4 py-3 max-w-6xl">
            <Link href="/" className="font-bold text-lg">Cook Book</Link>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
