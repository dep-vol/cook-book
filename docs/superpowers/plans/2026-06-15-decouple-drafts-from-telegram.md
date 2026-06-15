# Decouple Recipe Drafts from Telegram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the recipe drafts module to make it channel-agnostic, replacing `telegramChatId` and `telegramUserId` with `channel`, `channelChatId`, and `channelUserId` across the database schema, repositories, services, bot code, and unit tests.

**Architecture:** We will rename the database columns and update the compound query index. Then we will adapt the entity, repository, and service signatures to pass `channel`, `channelChatId`, and `channelUserId`. Finally, the Telegram bot implementation will adapt to pass `'telegram'` as the channel parameter.

**Tech Stack:** Next.js 16, Drizzle ORM, PostgreSQL, grammY, Inversify, Vitest.

---

### Task 1: Refactor Drizzle Database Schema and Generate Migration

**Files:**
- Modify: `src/modules/recipes/db/recipe.schema.ts`

- [x] **Step 1: Update the schema definition**
  Modify `src/modules/recipes/db/recipe.schema.ts` to replace `telegramChatId` and `telegramUserId` with `channel`, `channelChatId`, and `channelUserId`, and update the index:
  
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

- [x] **Step 2: Run Drizzle migration generator**
  Run: `pnpm db:generate`
  *(Note: If Drizzle asks if you renamed `telegram_chat_id` to `channel_chat_id` and `telegram_user_id` to `channel_user_id`, press Y to confirm so that it creates a rename migration rather than dropping/recreating columns).*

- [x] **Step 3: Run database migration**
  Run: `pnpm db:migrate`
  Expected: Successful application of the migrations without error.

- [x] **Step 4: Commit the schema changes and generated migrations**
  Run:
  ```bash
  git add src/modules/recipes/db/recipe.schema.ts drizzle/
  git commit -m "migration: rename telegram fields to channel fields in recipe_drafts"
  ```

---

### Task 2: Refactor RecipeDraft Entity and Interface Signatures

**Files:**
- Modify: `src/modules/recipe-drafts/entities/recipe-draft.entity.ts`
- Modify: `src/modules/recipe-drafts/repositories/recipe-draft.repository.interface.ts`
- Modify: `src/modules/recipe-drafts/services/recipe-draft.service.interface.ts`
- Modify: `tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts`

- [x] **Step 1: Update the unit tests to use new field names**
  Modify the mock draft definition and test assertions in `tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts` to replace `telegramChatId`/`telegramUserId` with `channel: 'telegram'`, `channelChatId: 'chat-1'`, `channelUserId: 'user-1'`.

- [x] **Step 2: Verify compilation fails**
  Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts`
  Expected: TypeScript compilation errors on type mismatches.

- [x] **Step 3: Update entity and interface definitions**
  * Update `RecipeDraftEntity` in `src/modules/recipe-drafts/entities/recipe-draft.entity.ts`:
    ```typescript
    export interface RecipeDraftEntity {
      id: string
      channel: string
      channelChatId: string
      channelUserId: string
      state: RecipeDraftState
      sourceType: RecipeDraftSourceType
      title: string | null
      ingredients: Array<{ name: string; amount: string; unit: string }>
      steps: Array<{ order: number; text: string }>
      cookTimeMinutes: number | null
      servings: number | null
      tags: string[]
      sourceText: string | null
      sourceUrl: string | null
      coverImageKey: string | null
      videoUrl: string | null
      lastAiSuggestion: unknown | null
      recipeId: string | null
      createdAt: Date
      updatedAt: Date
      expiresAt: Date
    }
    ```
  * Update `IRecipeDraftRepository` in `src/modules/recipe-drafts/repositories/recipe-draft.repository.interface.ts`:
    ```typescript
    export interface IRecipeDraftRepository {
      create(data: {
        channel: string
        channelChatId: string
        channelUserId: string
        sourceType: RecipeDraftEntity['sourceType']
      }): Promise<RecipeDraftEntity>
      findById(id: string): Promise<RecipeDraftEntity | null>
      findActiveDraft(channel: string, chatId: string, userId: string): Promise<RecipeDraftEntity | null>
      update(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity>
      markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity>
      delete(id: string): Promise<void>
    }
    ```
  * Update `IRecipeDraftService` in `src/modules/recipe-drafts/services/recipe-draft.service.interface.ts`:
    ```typescript
    export interface IRecipeDraftService {
      createDraft(input: {
        channel: string
        channelChatId: string
        channelUserId: string
        sourceType: RecipeDraftEntity['sourceType']
      }): Promise<RecipeDraftEntity>
      getActiveDraft(channel: string, chatId: string, userId: string): Promise<RecipeDraftEntity | null>
      updateDraft(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity>
      attachCoverImage(id: string, imageKey: string): Promise<RecipeDraftEntity>
      attachVideoUrl(id: string, videoUrl: string): Promise<RecipeDraftEntity>
      setEditing(id: string): Promise<RecipeDraftEntity>
      setConfirming(id: string): Promise<RecipeDraftEntity>
      saveDraft(id: string): Promise<RecipeEntity>
      markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity>
      discardDraft(id: string): Promise<void>
    }
    ```

- [x] **Step 4: Verify compilation succeeds (but tests fail at runtime)**
  Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts`
  Expected: Tests compile successfully but fail because implementations of Repository and Service still use old parameters.

- [x] **Step 5: Commit**
  Run:
  ```bash
  git add src/modules/recipe-drafts/entities/recipe-draft.entity.ts src/modules/recipe-drafts/repositories/recipe-draft.repository.interface.ts src/modules/recipe-drafts/services/recipe-draft.service.interface.ts tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts
  git commit -m "refactor: update recipe-draft entity and interface signatures to be channel-agnostic"
  ```

---

### Task 3: Refactor Repository and Service Implementations

**Files:**
- Modify: `src/modules/recipe-drafts/repositories/recipe-draft.repository.ts`
- Modify: `src/modules/recipe-drafts/services/recipe-draft.service.ts`

- [x] **Step 1: Update repository implementation**
  Modify `src/modules/recipe-drafts/repositories/recipe-draft.repository.ts`:
  * Update `create` method to store `channel`, `channelChatId`, `channelUserId`.
  * Rename `findByChatAndActive` to `findActiveDraft`, taking `channel`, `chatId`, and `userId` and query accordingly.
  
- [x] **Step 2: Update service implementation**
  Modify `src/modules/recipe-drafts/services/recipe-draft.service.ts`:
  * Update `createDraft` and `getActiveDraft` implementation to accept and pass `channel`, `channelChatId`, and `channelUserId`.

- [x] **Step 3: Run draft service tests**
  Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts`
  Expected: PASS

- [x] **Step 4: Commit**
  Run:
  ```bash
  git add src/modules/recipe-drafts/repositories/recipe-draft.repository.ts src/modules/recipe-drafts/services/recipe-draft.service.ts
  git commit -m "refactor: update recipe-draft repository and service implementations"
  ```

---

### Task 4: Refactor Bot Integration and Bot Tests

**Files:**
- Modify: `src/modules/bot/recipe-bot.ts`
- Modify: `tests/unit/bot/recipe-bot.test.ts`

- [x] **Step 1: Update bot unit tests**
  Modify `tests/unit/bot/recipe-bot.test.ts` to update test definitions of drafts, change mock service assertions to expect `channel: 'telegram'` on `createDraft` and `getActiveDraft`.

- [x] **Step 2: Verify bot tests fail**
  Run: `pnpm test:run tests/unit/bot/recipe-bot.test.ts`
  Expected: FAIL on parameter mismatch.

- [x] **Step 3: Refactor bot calls**
  Modify `src/modules/bot/recipe-bot.ts`:
  * Change `this.draftService.createDraft` invocation to pass `channel: 'telegram'`, `channelChatId: context.chatId`, `channelUserId: context.userId`.
  * Change `this.draftService.getActiveDraft` invocation to pass `'telegram'`, `context.chatId`, `context.userId`.

- [x] **Step 4: Run bot tests to verify they pass**
  Run: `pnpm test:run tests/unit/bot/recipe-bot.test.ts`
  Expected: PASS

- [x] **Step 5: Commit**
  Run:
  ```bash
  git add src/modules/bot/recipe-bot.ts tests/unit/bot/recipe-bot.test.ts
  git commit -m "refactor: integrate channel-agnostic draft service in bot"
  ```

---

### Task 5: End-to-End Verification

**Files:**
- None (Verification tasks)

- [x] **Step 1: Run full unit test suite**
  Run: `pnpm test:run`
  Expected: All 49 unit tests pass.

- [x] **Step 2: Run Next.js production build**
  Run: `pnpm build`
  Expected: Next.js builds successfully.

- [x] **Step 3: Verify bot entrypoint still boots**
  Run bot task: `pnpm bot`
  Expected: Bot logs that it has started on long polling. Clean up bot background task after confirmation.

- [x] **Step 4: Push / Finalize**
  Verify clean workspace (`git status`).
