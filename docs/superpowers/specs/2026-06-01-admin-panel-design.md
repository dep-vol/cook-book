# Admin Panel Design

## Goal

Add an admin-only section for creating, editing, and deleting recipes. Public users remain read-only. Auth is a single password stored in `.env`, session via httpOnly cookie signed with HMAC-SHA256 (Node.js built-in `crypto` — no new dependencies).

## Auth

Two env vars required:

```
ADMIN_PASSWORD=your-password
SESSION_SECRET=32-char-random-string
```

**`src/lib/session.ts`** — two helpers:
- `createSessionToken()` — returns `HMAC-SHA256(SESSION_SECRET, "admin")` as hex string
- `verifySessionToken(token)` — recomputes HMAC and compares with `timingSafeEqual`

**`src/app/actions/auth.actions.ts`** — two Server Actions:
- `loginAction(password)` — compares with `timingSafeEqual` against `ADMIN_PASSWORD`, on success sets `Set-Cookie: session=<token>; HttpOnly; Path=/; SameSite=Lax` (no expiry = session cookie)
- `logoutAction()` — clears the cookie, redirects to `/admin/login`

**`src/middleware.ts`** — runs on `/admin/:path*` (except `/admin/login`). Reads `session` cookie via `request.cookies.get('session')`, calls `verifySessionToken`. If invalid or missing → `NextResponse.redirect` to `/admin/login`. Export `config.matcher` to scope it to `/admin/:path*`.

## Route Structure

### New routes

| Path | File | Description |
|---|---|---|
| `/admin/login` | `src/app/admin/login/page.tsx` | Login form (password only) |
| `/admin` | `src/app/admin/page.tsx` | Recipes table (Server Component) |
| `/admin/recipes/new` | `src/app/admin/recipes/new/page.tsx` | Create recipe form |
| `/admin/recipes/[id]/edit` | `src/app/admin/recipes/[id]/edit/page.tsx` | Edit / delete recipe form |

**`src/app/admin/layout.tsx`** — shared admin layout: header with site name, "← На сайт" link, "Выйти" button (calls `logoutAction`).

### Deleted routes

- `src/app/recipes/new/page.tsx`
- `src/app/recipes/[id]/edit/page.tsx`

### Public routes — unchanged

`/`, `/recipes`, `/recipes/[id]` remain fully public and read-only.

## Admin Table (`/admin`)

Server Component. Fetches all recipes via `getRecipesAction()`. Renders:

- Header row: "Рецепты (N)" count, "+ Добавить рецепт" button → `/admin/recipes/new`
- Table columns: Название | Теги | Добавлен | Действия
- Each row: "Редактировать" link → `/admin/recipes/[id]/edit`, "Удалить" button (Server Action + `confirm()`)

## Login Page (`/admin/login`)

Client Component. Single password field, "Войти" button. On submit calls `loginAction`. On error shows inline message "Неверный пароль". On success Server Action redirects to `/admin`.

## Create / Edit Pages

Reuse existing `RecipeForm` + `RecipeFormViewModel` unchanged. Wire to existing `createRecipeAction` / `updateRecipeAction` / `deleteRecipeAction` from `src/app/actions/recipe.actions.ts`.

After create → redirect to `/admin`. After update → redirect to `/admin`. After delete → redirect to `/admin`.

## What Does Not Change

- `RecipeEntity`, `RecipeService`, `RecipeRepository` — no changes
- `RecipeForm`, `RecipeFormViewModel` — no changes
- `recipe.actions.ts` — no changes
- Database schema — no changes
- Public pages — no changes

## Error Handling

| Scenario | Result |
|---|---|
| Wrong password on login | Inline error message, cookie not set |
| Missing / invalid session cookie | Middleware redirects to `/admin/login` |
| Delete confirmation cancelled | `confirm()` returns false, action not called |
