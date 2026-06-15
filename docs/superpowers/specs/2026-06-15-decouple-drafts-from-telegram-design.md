# Spec: Decouple Recipe Drafts from Telegram Channel

## Overview
Currently, the `recipe_drafts` database table and related services (`RecipeDraftService`, `RecipeDraftRepository`) are tightly coupled to Telegram through hardcoded columns `telegram_chat_id` and `telegram_user_id`.
This design document defines the refactoring to make the drafts module channel-agnostic, replacing specific Telegram columns with generic channel metadata while preserving data and query performance.

## Architectural Changes

### 1. Database Schema
In [src/modules/recipes/db/recipe.schema.ts](file:///Users/tecto/projects/cook-book/src/modules/recipes/db/recipe.schema.ts):
- Rename `telegramChatId` to `channelChatId`.
- Rename `telegramUserId` to `channelUserId`.
- Add `channel` column of type `text` with default `'telegram'`.
- Update the lookup index to include `channel`.

```typescript
export const recipeDrafts = pgTable(
  'recipe_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').notNull().default('telegram'),
    channelChatId: text('channel_chat_id').notNull(),
    channelUserId: text('channel_user_id').notNull(),
    state: recipeDraftStateEnum('state').notNull().default('editing'),
    sourceType: recipeDraftSourceTypeEnum('source_type').notNull(),
    title: text('title'),
    ingredients: jsonb('ingredients').notNull().$type<Array<{ name: string; amount: string; unit: string }>>().default([]),
    steps: jsonb('steps').notNull().$type<Array<{ order: number; text: string }>>().default([]),
    cookTimeMinutes: integer('cook_time_minutes'),
    servings: integer('servings'),
    tags: text('tags').array().notNull().default([]),
    sourceText: text('source_text'),
    sourceUrl: text('source_url'),
    coverImageKey: text('cover_image_key'),
    videoUrl: text('video_url'),
    lastAiSuggestion: jsonb('last_ai_suggestion').$type<unknown>(),
    recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('recipe_drafts_active_lookup_idx').on(
      table.channel,
      table.channelChatId,
      table.channelUserId,
      table.state,
      table.expiresAt,
      table.updatedAt
    ),
  ]
)
```

### 2. Entity and Service Signatures
In [src/modules/recipe-drafts/entities/recipe-draft.entity.ts](file:///Users/tecto/projects/cook-book/src/modules/recipe-drafts/entities/recipe-draft.entity.ts):
- Update `RecipeDraftEntity` fields:
  ```typescript
  export interface RecipeDraftEntity {
    id: string
    channel: string
    channelChatId: string
    channelUserId: string
    state: RecipeDraftState
    ...
  }
  ```

In [src/modules/recipe-drafts/services/recipe-draft.service.interface.ts](file:///Users/tecto/projects/cook-book/src/modules/recipe-drafts/services/recipe-draft.service.interface.ts) and implementation [src/modules/recipe-drafts/services/recipe-draft.service.ts](file:///Users/tecto/projects/cook-book/src/modules/recipe-drafts/services/recipe-draft.service.ts):
- Update `createDraft` input properties.
- Update `getActiveDraft` signature:
  ```typescript
  getActiveDraft(channel: string, chatId: string, userId: string): Promise<RecipeDraftEntity | null>
  ```

### 3. Repository Adaptations
In [src/modules/recipe-drafts/repositories/recipe-draft.repository.interface.ts](file:///Users/tecto/projects/cook-book/src/modules/recipe-drafts/repositories/recipe-draft.repository.interface.ts) and [src/modules/recipe-drafts/repositories/recipe-draft.repository.ts](file:///Users/tecto/projects/cook-book/src/modules/recipe-drafts/repositories/recipe-draft.repository.ts):
- Update signatures to query using `channel`, `channelChatId`, and `channelUserId`.

### 4. Bot Adaptation
In [src/modules/bot/recipe-bot.ts](file:///Users/tecto/projects/cook-book/src/modules/bot/recipe-bot.ts):
- Pass `'telegram'` as the channel parameter when calling draft service methods.

## Migration Strategy
To preserve existing draft data, the SQL migration will rename columns instead of dropping and recreating them:
```sql
ALTER TABLE "recipe_drafts" RENAME COLUMN "telegram_chat_id" TO "channel_chat_id";
ALTER TABLE "recipe_drafts" RENAME COLUMN "telegram_user_id" TO "channel_user_id";
ALTER TABLE "recipe_drafts" ADD COLUMN "channel" text DEFAULT 'telegram' NOT NULL;
```

## Verification Plan
1. Generate migration using `pnpm db:generate`.
2. Apply migration using `pnpm db:migrate`.
3. Update and run all unit tests: `pnpm test:run`. All unit tests must pass.
4. Run application build checking next.js compilation: `pnpm build`.
