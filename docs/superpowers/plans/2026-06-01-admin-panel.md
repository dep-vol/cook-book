# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a password-protected `/admin` section for creating, editing and deleting recipes; public users remain read-only.

**Architecture:** Single admin password in `.env`, HMAC-SHA256 session token stored in an httpOnly cookie (Web Crypto — no new dependencies). Next.js middleware guards all `/admin/*` routes except `/admin/login`. Admin UI is a dedicated route group that reuses existing `RecipeForm` and recipe Server Actions.

**Tech Stack:** Next.js 16 App Router, Node.js `crypto` (auth actions), Web Crypto `crypto.subtle` (session helpers + middleware), Tailwind CSS, existing Inversify DI + Drizzle ORM.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/session.ts` | Web Crypto HMAC helpers: `createSessionToken`, `verifySessionToken` |
| Create | `tests/unit/auth/session.test.ts` | Unit tests for session helpers |
| Create | `src/app/actions/auth.actions.ts` | `loginAction` / `logoutAction` Server Actions |
| Create | `src/middleware.ts` | Redirect unauthenticated requests from `/admin/*` to `/admin/login` |
| Create | `src/app/admin/login/page.tsx` | Login form (Client Component) |
| Create | `src/app/admin/layout.tsx` | Shared admin header with logout |
| Create | `src/app/admin/_components/delete-button.tsx` | Delete confirm button (Client Component) |
| Create | `src/app/admin/page.tsx` | Recipes table (Server Component) |
| Create | `src/app/admin/recipes/new/page.tsx` | Create recipe form |
| Create | `src/app/admin/recipes/[id]/edit/page.tsx` | Edit / delete recipe form |
| Modify | `src/app/actions/recipe.actions.ts` | Add `revalidatePath('/admin')` to create/update/delete |
| Modify | `src/app/recipes/page.tsx` | Remove "+ Добавить рецепт" link |
| Modify | `src/app/recipes/[id]/page.tsx` | Remove "Редактировать" link |
| Delete | `src/app/recipes/new/page.tsx` | Moved to admin |
| Delete | `src/app/recipes/[id]/edit/page.tsx` | Moved to admin |
| Modify | `.env.example` | Add `ADMIN_PASSWORD`, `SESSION_SECRET` |

---

## Task 1: Session Helpers

**Files:**
- Create: `src/lib/session.ts`
- Create: `tests/unit/auth/session.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `tests/unit/auth/session.test.ts`:

```typescript
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
```

- [ ] **Step 1.2: Run tests — expect failure**

```bash
pnpm vitest run tests/unit/auth/session.test.ts
```

Expected: `Cannot find module '@/lib/session'`

- [ ] **Step 1.3: Implement session helpers**

Create `src/lib/session.ts`:

```typescript
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
```

- [ ] **Step 1.4: Run tests — expect pass**

```bash
pnpm vitest run tests/unit/auth/session.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/session.ts tests/unit/auth/session.test.ts
git commit -m "feat: add HMAC session helpers with tests"
```

---

## Task 2: Auth Server Actions

**Files:**
- Create: `src/app/actions/auth.actions.ts`

- [ ] **Step 2.1: Create auth actions**

Create `src/app/actions/auth.actions.ts`:

```typescript
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
```

- [ ] **Step 2.2: Commit**

```bash
git add src/app/actions/auth.actions.ts
git commit -m "feat: add loginAction and logoutAction"
```

---

## Task 3: Middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 3.1: Create middleware**

Create `src/middleware.ts`:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/session'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/admin/login') return NextResponse.next()

  const token = request.cookies.get('session')?.value
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/admin/:path*',
}
```

- [ ] **Step 3.2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add admin route protection middleware"
```

---

## Task 4: Login Page

**Files:**
- Create: `src/app/admin/login/page.tsx`

- [ ] **Step 4.1: Create login page**

Create `src/app/admin/login/page.tsx`:

```tsx
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
```

- [ ] **Step 4.2: Commit**

```bash
git add src/app/admin/login/page.tsx
git commit -m "feat: add admin login page"
```

---

## Task 5: Admin Layout + Delete Button

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/_components/delete-button.tsx`

- [ ] **Step 5.1: Create admin layout**

Create `src/app/admin/layout.tsx`:

```tsx
import Link from 'next/link'
import { logoutAction } from '@/app/actions/auth.actions'

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
```

- [ ] **Step 5.2: Create delete button component**

Create `src/app/admin/_components/delete-button.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { deleteRecipeAction } from '@/app/actions/recipe.actions'

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter()

  async function handleClick() {
    if (!confirm('Удалить рецепт?')) return
    await deleteRecipeAction(id)
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      className="text-red-400 hover:text-red-300 text-sm transition-colors"
    >
      Удалить
    </button>
  )
}
```

- [ ] **Step 5.3: Commit**

```bash
git add src/app/admin/layout.tsx src/app/admin/_components/delete-button.tsx
git commit -m "feat: add admin layout and delete button component"
```

---

## Task 6: Admin Table Page

**Files:**
- Create: `src/app/admin/page.tsx`

- [ ] **Step 6.1: Create admin table page**

Create `src/app/admin/page.tsx`:

```tsx
import Link from 'next/link'
import { getRecipesAction } from '@/app/actions/recipe.actions'
import { DeleteButton } from './_components/delete-button'

export default async function AdminPage() {
  const recipes = await getRecipesAction()

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-semibold">Рецепты</h1>
          <p className="text-sm text-gray-400 mt-0.5">{recipes.length} записей</p>
        </div>
        <Link
          href="/admin/recipes/new"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          + Добавить рецепт
        </Link>
      </div>

      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800 bg-gray-900/50">
            <tr className="text-xs text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Название</th>
              <th className="px-4 py-3 text-left font-medium">Теги</th>
              <th className="px-4 py-3 text-left font-medium">Добавлен</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((recipe) => (
              <tr key={recipe.id} className="border-t border-gray-800 hover:bg-gray-900/30">
                <td className="px-4 py-3 font-medium">{recipe.title}</td>
                <td className="px-4 py-3 text-gray-400">
                  {recipe.tags.slice(0, 3).join(', ')}
                  {recipe.tags.length > 3 && ' …'}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {recipe.createdAt.toLocaleDateString('ru-RU')}
                </td>
                <td className="px-4 py-3 text-right space-x-4">
                  <Link
                    href={`/admin/recipes/${recipe.id}/edit`}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Редактировать
                  </Link>
                  <DeleteButton id={recipe.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recipes.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">Рецептов пока нет</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add admin recipes table page"
```

---

## Task 7: Admin Create Page

**Files:**
- Create: `src/app/admin/recipes/new/page.tsx`

- [ ] **Step 7.1: Create admin new recipe page**

Create `src/app/admin/recipes/new/page.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import { createRecipeAction } from '@/app/actions/recipe.actions'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

export default function AdminNewRecipePage() {
  const router = useRouter()

  async function handleSubmit(data: CreateRecipeDTO) {
    const result = await createRecipeAction(data)
    if ('error' in result) throw new Error(JSON.stringify(result.error))
    router.push('/admin')
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Новый рецепт</h1>
      <RecipeForm onSubmit={handleSubmit} />
    </div>
  )
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/app/admin/recipes/new/page.tsx
git commit -m "feat: add admin create recipe page"
```

---

## Task 8: Admin Edit Page

**Files:**
- Create: `src/app/admin/recipes/[id]/edit/page.tsx`

- [ ] **Step 8.1: Create admin edit recipe page**

Create `src/app/admin/recipes/[id]/edit/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import {
  getRecipeByIdAction,
  updateRecipeAction,
  deleteRecipeAction,
} from '@/app/actions/recipe.actions'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

interface Props {
  params: Promise<{ id: string }>
}

export default function AdminEditRecipePage({ params }: Props) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<RecipeEntity | null>(null)

  useEffect(() => {
    params.then(p => {
      setId(p.id)
      getRecipeByIdAction(p.id).then(setRecipe)
    })
  }, [params])

  async function handleSubmit(data: CreateRecipeDTO) {
    if (!id) return
    const result = await updateRecipeAction(id, data)
    if ('error' in result) throw new Error(JSON.stringify(result.error))
    router.push('/admin')
  }

  async function handleDelete() {
    if (!id || !confirm('Удалить рецепт?')) return
    await deleteRecipeAction(id)
    router.push('/admin')
  }

  if (!recipe) return <div className="text-gray-400 py-8">Загрузка...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">Редактировать рецепт</h1>
        <button
          onClick={handleDelete}
          className="text-red-400 hover:text-red-300 text-sm transition-colors"
        >
          Удалить
        </button>
      </div>
      <RecipeForm
        onSubmit={handleSubmit}
        initialData={{
          title: recipe.title,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          cookTimeMinutes: recipe.cookTimeMinutes ?? undefined,
          servings: recipe.servings ?? undefined,
          tags: recipe.tags,
          sourceUrl: recipe.sourceUrl ?? undefined,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/app/admin/recipes/[id]/edit/page.tsx
git commit -m "feat: add admin edit recipe page"
```

---

## Task 9: Cleanup

**Files:**
- Delete: `src/app/recipes/new/page.tsx`
- Delete: `src/app/recipes/[id]/edit/page.tsx`
- Modify: `src/app/recipes/page.tsx`
- Modify: `src/app/recipes/[id]/page.tsx`
- Modify: `src/app/actions/recipe.actions.ts`
- Modify: `.env.example`

- [ ] **Step 9.1: Delete old edit/create pages**

```bash
git rm src/app/recipes/new/page.tsx src/app/recipes/[id]/edit/page.tsx
```

- [ ] **Step 9.2: Remove "+ Добавить рецепт" from public recipes list**

In `src/app/recipes/page.tsx`, replace:

```tsx
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Мои рецепты</h1>
        <Link
          href="/recipes/new"
          className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          + Добавить рецепт
        </Link>
      </div>
      <RecipeGrid recipes={recipes} />
    </div>
  )
```

With:

```tsx
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Мои рецепты</h1>
      <RecipeGrid recipes={recipes} />
    </div>
  )
```

Also remove the unused `Link` import if it's now unused:

```tsx
import { container } from '@/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { RecipeGrid } from '@/modules/recipes/ui/recipe-grid'
```

- [ ] **Step 9.3: Remove "Редактировать" link from recipe detail page**

In `src/app/recipes/[id]/page.tsx`, replace:

```tsx
      <div className="flex justify-between items-start mb-6">
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
        <Link href={`/recipes/${id}/edit`} className="text-sm text-gray-500 hover:underline">
          Редактировать
        </Link>
      </div>
```

With:

```tsx
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
      </div>
```

Also remove the now-unused `Link` import from that file.

- [ ] **Step 9.4: Add `revalidatePath('/admin')` to recipe actions**

In `src/app/actions/recipe.actions.ts`, update `createRecipeAction`:

```typescript
export async function createRecipeAction(formData: unknown) {
  const parsed = CreateRecipeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const service = container.get(RecipeServiceToken)
  const recipe = await service.create(parsed.data)

  revalidatePath('/')
  revalidatePath('/recipes')
  revalidatePath('/admin')
  return { data: recipe }
}
```

Update `updateRecipeAction`:

```typescript
export async function updateRecipeAction(id: string, formData: unknown) {
  const parsed = UpdateRecipeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const service = container.get(RecipeServiceToken)
  const recipe = await service.update(id, parsed.data)

  revalidatePath('/')
  revalidatePath(`/recipes/${id}`)
  revalidatePath('/admin')
  return { data: recipe }
}
```

Update `deleteRecipeAction`:

```typescript
export async function deleteRecipeAction(id: string) {
  const service = container.get(RecipeServiceToken)
  await service.delete(id)

  revalidatePath('/')
  revalidatePath('/recipes')
  revalidatePath('/admin')
}
```

- [ ] **Step 9.5: Add env vars to `.env.example`**

Append to `.env.example`:

```
ADMIN_PASSWORD=your-admin-password
SESSION_SECRET=replace-with-32-char-random-string
```

Generate a real `SESSION_SECRET` and add both to your local `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output as `SESSION_SECRET` in `.env`, and set `ADMIN_PASSWORD` to your desired password.

- [ ] **Step 9.6: Run full test suite**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 9.7: Commit**

```bash
git add src/app/recipes/page.tsx src/app/recipes/[id]/page.tsx src/app/actions/recipe.actions.ts .env.example
git commit -m "feat: complete admin panel — remove public edit links, update revalidations"
```

- [ ] **Step 9.8: Manual smoke test**

Start the dev server (`pnpm dev`) and verify:

1. Open `http://localhost:3000/admin` — should redirect to `/admin/login`
2. Enter wrong password — should show "Неверный пароль"
3. Enter correct password — should redirect to `/admin` and show the recipes table
4. Click "Редактировать" on a recipe — should open the edit form
5. Save changes — should redirect back to `/admin` with updated data
6. Click "Удалить", confirm — recipe should disappear from the table
7. Click "+ Добавить рецепт", fill the form, save — new recipe appears in the table
8. Click "Выйти" — should redirect to `/admin/login`
9. Open `http://localhost:3000/recipes` — no "Добавить рецепт" button visible
10. Open any recipe detail page — no "Редактировать" link visible
