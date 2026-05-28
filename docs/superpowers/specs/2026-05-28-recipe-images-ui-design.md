# Recipe Images UI Design

## Goal

Display recipe cover images (stored in MinIO) in the recipe card grid and on the recipe detail page.

## Architecture

Server Components in Next.js App Router can be `async` and call backend resources directly. `RecipeCard` and the recipe detail page will call `getImageUrl(imageKey)` from `src/lib/minio.ts` to get a presigned URL (1-hour expiry), then render it as an `<img>`. No new API routes, no service layer changes.

## Data Flow

```
RecipeEntity.imageKey (string | null)
  → getImageUrl(imageKey)    // presigned MinIO URL, called server-side
  → imageUrl: string | null  // null if imageKey is null or MinIO fails
  → <img src={imageUrl} />   // only rendered when imageUrl is not null
```

`getImageUrl` errors are caught locally — a broken MinIO connection must not break the page. On failure, `imageUrl = null` and the image is silently omitted.

## Components

### RecipeCard (`src/modules/recipes/ui/recipe-card.tsx`)

- Becomes `async function RecipeCard`
- If `recipe.imageKey` is not null, calls `getImageUrl(recipe.imageKey)`; wraps in try/catch returning `null` on error
- When `imageUrl` is not null: renders a `<div>` above the title with `aspect-video overflow-hidden rounded-t-lg` containing `<img className="w-full h-full object-cover" />`
- When `imageUrl` is null: card looks identical to today — no placeholder, no empty space

### Recipe Detail Page (`src/app/recipes/[id]/page.tsx`)

- Page is already `async` — add `getImageUrl` call after `service.getById(id)`, wrapped in try/catch
- When `imageUrl` is not null: renders `<img>` with `w-full rounded-lg object-cover max-h-80` between the title row and the meta row (⏱/🍽)
- When `imageUrl` is null: page looks identical to today

## Error Handling

| Scenario | Result |
|---|---|
| `imageKey === null` | `getImageUrl` not called; no image rendered |
| MinIO unavailable | try/catch returns `null`; no image rendered |
| Image URL valid | `<img>` rendered normally |

## What Does Not Change

- `RecipeEntity` type — `imageKey: string | null` already exists
- `RecipeService` — no changes
- `RecipeGrid` — passes `RecipeEntity` as-is; `RecipeCard` resolves the URL internally
- Database schema — `image_key` column already exists
