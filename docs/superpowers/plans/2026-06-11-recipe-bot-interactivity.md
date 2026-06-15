# Recipe Bot Interactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive Telegram recipe-creation flow with inline buttons, persistent drafts, AI-assisted editing, cover photos from user images, and recipe video links.

**Architecture:** Keep `ImportJob` for one-shot imports and add a separate `RecipeDraft` flow for guided creation. The bot will route messages and callback queries into draft state transitions, while a small assistant service uses the LLM only for bounded suggestions and structured draft filling.

**Tech Stack:** Next.js 16 App Router, grammY, Inversify, Drizzle ORM, Zod, MobX, OpenAI, PostgreSQL, Vitest.

---

### Task 1: Expand the recipe data model

**Files:**
- Modify: `src/modules/recipes/entities/recipe.entity.ts`
- Modify: `src/modules/recipes/transport/recipe.dto.ts`
- Modify: `src/modules/recipes/db/recipe.schema.ts`
- Modify: `src/modules/recipes/repositories/recipe.repository.ts`
- Modify: `src/app/recipes/[id]/page.tsx`
- Test: `tests/unit/modules/recipes/recipe.dto.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { CreateRecipeSchema } from '@/modules/recipes/transport/recipe.dto'

describe('CreateRecipeSchema', () => {
  it('accepts a recipe video URL', () => {
    const parsed = CreateRecipeSchema.parse({
      title: 'Cake',
      ingredients: [{ name: 'Flour', amount: '200', unit: 'g' }],
      steps: [{ order: 1, text: 'Mix everything' }],
      cookTimeMinutes: 30,
      servings: 4,
      tags: ['dessert'],
      sourceUrl: null,
      imageKey: null,
      videoUrl: 'https://youtube.com/watch?v=abc123',
    })

    expect(parsed.videoUrl).toBe('https://youtube.com/watch?v=abc123')
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run tests/unit/modules/recipes/recipe.dto.test.ts`
Expected: fail because `videoUrl` is not part of the schema yet.

- [x] **Step 3: Add the field everywhere it belongs**

```ts
// src/modules/recipes/transport/recipe.dto.ts
export const CreateRecipeSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  ingredients: z.array(IngredientSchema).min(1, 'Добавьте хотя бы один ингредиент'),
  steps: z.array(StepSchema).min(1, 'Добавьте хотя бы один шаг'),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  tags: z.array(z.string()).default([]),
  sourceUrl: z.string().url().nullable().optional(),
  imageKey: z.string().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
})
```

```ts
// src/modules/recipes/entities/recipe.entity.ts
export interface RecipeEntity {
  id: string
  title: string
  ingredients: Ingredient[]
  steps: Step[]
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
  sourceUrl: string | null
  imageKey: string | null
  videoUrl: string | null
  createdAt: Date
  updatedAt: Date
}
```

```ts
// src/modules/recipes/db/recipe.schema.ts
videoUrl: text('video_url'),
```

```ts
// src/modules/recipes/repositories/recipe.repository.ts
videoUrl: row.videoUrl,
```

```ts
// src/modules/recipes/repositories/recipe.repository.ts
return this.repo.create({
  ...data,
  videoUrl: data.videoUrl ?? null,
})
```

```ts
// src/modules/recipes/repositories/recipe.repository.ts
if (data.videoUrl !== undefined) updateData.videoUrl = data.videoUrl ?? null
```

- [x] **Step 4: Run the test again**

Run: `pnpm test:run tests/unit/modules/recipes/recipe.dto.test.ts`
Expected: pass.

- [x] **Step 5: Regenerate and inspect the database migration**

Run: `pnpm db:generate`
Expected: a new migration under `drizzle/` that adds `video_url` to `recipes`.

- [x] **Step 6: Verify the recipe detail page renders the new field**

```tsx
{recipe.videoUrl && (
  <a
    href={recipe.videoUrl}
    target="_blank"
    rel="noreferrer"
    className="mt-3 block text-sm text-blue-500 hover:underline"
  >
    Видео-рецепт →
  </a>
)}
```

Run: `pnpm test:run tests/unit/modules/recipes/recipe.dto.test.ts`
Expected: pass, then manually inspect `src/app/recipes/[id]/page.tsx` for the link placement.

- [x] **Step 7: Commit**

```bash
git add src/modules/recipes/entities/recipe.entity.ts src/modules/recipes/transport/recipe.dto.ts src/modules/recipes/db/recipe.schema.ts src/modules/recipes/repositories/recipe.repository.ts src/app/recipes/[id]/page.tsx tests/unit/modules/recipes/recipe.dto.test.ts drizzle/
git commit -m "feat: add recipe video url support"
```

### Task 2: Add persistent recipe drafts

**Files:**
- Create: `src/modules/recipe-drafts/entities/recipe-draft.entity.ts`
- Create: `src/modules/recipe-drafts/db/recipe-draft.schema.ts`
- Create: `src/modules/recipe-drafts/repositories/recipe-draft.repository.interface.ts`
- Create: `src/modules/recipe-drafts/repositories/recipe-draft.repository.ts`
- Create: `src/modules/recipe-drafts/services/recipe-draft.service.interface.ts`
- Create: `src/modules/recipe-drafts/services/recipe-draft.service.ts`
- Create: `src/tokens/recipe-draft.tokens.ts`
- Modify: `src/container.ts`
- Test: `tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { RecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service'

it('creates a draft in editing state and persists attached media', async () => {
  const repo = {
    create: vi.fn().mockResolvedValue({ id: 'draft-1', state: 'editing' }),
    update: vi.fn().mockResolvedValue({
      id: 'draft-1',
      state: 'editing',
      coverImageKey: 'minio/cover.jpg',
      videoUrl: 'https://youtu.be/abc123',
    }),
    findByChatAndActive: vi.fn(),
    findById: vi.fn(),
  }

  const service = new RecipeDraftService(repo as never)
  const draft = await service.createDraft({
    telegramChatId: '100',
    telegramUserId: '200',
    sourceType: 'manual',
  })

  expect(draft.state).toBe('editing')
  await service.attachCoverImage(draft.id, 'minio/cover.jpg')
  await service.attachVideoUrl(draft.id, 'https://youtu.be/abc123')
  expect(repo.update).toHaveBeenCalledWith(
    'draft-1',
    expect.objectContaining({
      coverImageKey: 'minio/cover.jpg',
      videoUrl: 'https://youtu.be/abc123',
    }),
  )
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts`
Expected: fail because the draft module does not exist yet.

- [x] **Step 3: Add the draft module with a small, explicit surface**

```ts
export type RecipeDraftState = 'editing' | 'confirming' | 'saved' | 'expired'

export interface RecipeDraftEntity {
  id: string
  telegramChatId: string
  telegramUserId: string
  state: RecipeDraftState
  sourceType: 'manual' | 'text' | 'photo' | 'url'
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
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}
```

```ts
export interface IRecipeDraftRepository {
  create(data: {
    telegramChatId: string
    telegramUserId: string
    sourceType: RecipeDraftEntity['sourceType']
  }): Promise<RecipeDraftEntity>
  findById(id: string): Promise<RecipeDraftEntity | null>
  findByChatAndActive(chatId: string, userId: string): Promise<RecipeDraftEntity | null>
  update(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity>
  markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity>
}
```

```ts
// src/modules/recipe-drafts/services/recipe-draft.service.ts
createDraft(input: { telegramChatId: string; telegramUserId: string; sourceType: RecipeDraftEntity['sourceType'] }): Promise<RecipeDraftEntity>
getActiveDraft(chatId: string, userId: string): Promise<RecipeDraftEntity | null>
updateDraft(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity>
attachCoverImage(id: string, imageKey: string): Promise<RecipeDraftEntity>
attachVideoUrl(id: string, videoUrl: string): Promise<RecipeDraftEntity>
setEditing(id: string): Promise<RecipeDraftEntity>
setConfirming(id: string): Promise<RecipeDraftEntity>
markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity>
discardDraft(id: string): Promise<void>
```

- [x] **Step 4: Wire the module into DI and persistence**

```ts
// src/container.ts
container.bind(RecipeDraftRepositoryToken).to(RecipeDraftRepository).inSingletonScope()
container.bind(RecipeDraftServiceToken).to(RecipeDraftService).inSingletonScope()
```

```ts
// src/modules/recipe-drafts/db/recipe-draft.schema.ts
state: text('state').notNull().default('editing'),
coverImageKey: text('cover_image_key'),
videoUrl: text('video_url'),
lastAiSuggestion: jsonb('last_ai_suggestion'),
```

- [x] **Step 5: Run the test again**

Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts`
Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/modules/recipe-drafts src/tokens/recipe-draft.tokens.ts src/container.ts tests/unit/modules/recipe-drafts/recipe-draft.service.test.ts
git commit -m "feat: add recipe draft persistence"
```

### Task 3: Add Telegram callback-based draft flow

**Files:**
- Modify: `src/modules/bot/bot-adapter.interface.ts`
- Modify: `src/modules/bot/adapters/telegram.adapter.ts`
- Modify: `src/modules/bot/recipe-bot.ts`
- Test: `tests/unit/modules/bot/recipe-bot.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { RecipeBot } from '@/modules/bot/recipe-bot'

function createFakeAdapter() {
  let callbackHandler: ((data: string) => Promise<{ text: string; buttons?: Array<Array<{ text: string; data: string }>> }>) | null = null
  return {
    onStart: vi.fn(),
    onText: vi.fn(),
    onPhoto: vi.fn(),
    onCallback: vi.fn((handler) => { callbackHandler = handler }),
    start: vi.fn(),
    emitCallback: async (data: string) => {
      if (!callbackHandler) throw new Error('callback handler missing')
      return callbackHandler(data)
    },
  }
}

it('starts a draft from the new recipe callback', async () => {
  const adapter = createFakeAdapter()
  const service = {
    createDraft: vi.fn().mockResolvedValue({ id: 'draft-1', state: 'editing' }),
    getActiveDraft: vi.fn(),
    updateDraft: vi.fn(),
  }
  const bot = new RecipeBot(adapter as never, service as never, {} as never, {} as never)

  bot.register()
  await adapter.emitCallback('new_recipe')

  expect(service.createDraft).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'manual' }))
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run tests/unit/modules/bot/recipe-bot.test.ts`
Expected: fail because the adapter has no callback support yet.

- [x] **Step 3: Extend the bot adapter contract to handle inline actions**

```ts
export interface IBotAdapter {
  onStart(handler: () => string): void
  onText(handler: (text: string) => Promise<string>): void
  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string) => Promise<string>): void
  onCallback(handler: (data: string) => Promise<{ text: string; buttons?: Array<Array<{ text: string; data: string }>> }>): void
  start(): void
}
```

```ts
// src/modules/bot/adapters/telegram.adapter.ts
this.bot.on('callback_query:data', async ctx => {
  const payload = await handler(ctx.callbackQuery.data)
  await ctx.answerCallbackQuery()
  await ctx.editMessageText(payload.text, {
    reply_markup: payload.buttons ? { inline_keyboard: payload.buttons } : undefined,
  })
})
```

```ts
// src/modules/bot/recipe-bot.ts
constructor(
  private readonly adapter: IBotAdapter,
  private readonly drafts: IRecipeDraftService,
  private readonly imports: IImportJobService,
  private readonly assistant: IRecipeAssistantService,
) {}

if (data === 'new_recipe') {
  const draft = await this.drafts.createDraft({ telegramChatId, telegramUserId, sourceType: 'manual' })
  return { text: this.renderDraft(draft), buttons: this.renderDraftButtons(draft) }
}
```

- [x] **Step 4: Implement the draft menu and state transitions**

```ts
buttons: [
  [{ text: 'Добавить ингредиент', data: `draft:add_ingredient:${draft.id}` }],
  [{ text: 'Добавить шаг', data: `draft:add_step:${draft.id}` }],
  [{ text: 'Прикрепить фото', data: `draft:add_photo:${draft.id}` }],
  [{ text: 'Добавить видео-ссылку', data: `draft:add_video:${draft.id}` }],
  [{ text: 'Спросить ИИ', data: `draft:ask_ai:${draft.id}` }],
  [{ text: 'Сохранить', data: `draft:save:${draft.id}` }],
]
```

- [x] **Step 5: Run the test again**

Run: `pnpm test:run tests/unit/modules/bot/recipe-bot.test.ts`
Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/modules/bot/bot-adapter.interface.ts src/modules/bot/adapters/telegram.adapter.ts src/modules/bot/recipe-bot.ts tests/unit/modules/bot/recipe-bot.test.ts
git commit -m "feat: add interactive bot draft flow"
```

### Task 4: Add the AI assistant and final save path

**Files:**
- Create: `src/modules/recipe-drafts/services/recipe-assistant.service.ts`
- Create: `src/modules/recipe-drafts/services/recipe-assistant.service.interface.ts`
- Modify: `src/modules/recipe-drafts/services/recipe-draft.service.ts`
- Modify: `src/modules/recipes/services/recipe.service.ts`
- Modify: `src/app/recipes/[id]/page.tsx`
- Test: `tests/unit/modules/recipe-drafts/recipe-assistant.service.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { RecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service'

it('rejects malformed AI draft output without mutating the draft', async () => {
  const llm = {
    suggestDraft: vi.fn().mockResolvedValue('not json'),
  }
  const assistant = new RecipeAssistantService(llm as never)

  await expect(
    assistant.suggestFromText('borsch with potatoes')
  ).rejects.toThrow('Invalid draft suggestion')
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-assistant.service.test.ts`
Expected: fail because the assistant service does not exist yet.

- [x] **Step 3: Implement a constrained assistant prompt and schema**

```ts
export const DraftSuggestionSchema = z.object({
  title: z.string().min(1),
  ingredients: z.array(IngredientSchema).min(1),
  steps: z.array(StepSchema).min(1),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  tags: z.array(z.string()).default([]),
})
```

```ts
// assistant service entry point
suggestFromText(input: string): Promise<DraftSuggestion>
suggestFromPhoto(base64: string, mimeType: string, caption?: string): Promise<DraftSuggestion>
```

```ts
export interface IRecipeAssistantService {
  suggestFromText(input: string): Promise<DraftSuggestion>
  suggestFromPhoto(base64: string, mimeType: string, caption?: string): Promise<DraftSuggestion>
}
```

- [x] **Step 4: Convert a confirmed draft into a recipe**

```ts
// src/modules/recipe-drafts/services/recipe-draft.service.ts
async saveDraft(id: string): Promise<RecipeEntity> {
  const draft = await this.repo.findById(id)
  if (!draft) throw new Error(`Draft not found: ${id}`)
  if (!draft.title || draft.ingredients.length === 0 || draft.steps.length === 0) {
    throw new Error('Draft is incomplete')
  }
  const recipe = await this.recipeService.create({
    title: draft.title,
    ingredients: draft.ingredients,
    steps: draft.steps,
    cookTimeMinutes: draft.cookTimeMinutes,
    servings: draft.servings,
    tags: draft.tags,
    sourceUrl: draft.sourceUrl,
    imageKey: draft.coverImageKey,
    videoUrl: draft.videoUrl,
  })
  await this.repo.markSaved(id, recipe.id)
  return recipe
}
```

- [x] **Step 5: Render the video link on the recipe detail page**

```tsx
{recipe.videoUrl && (
  <a href={recipe.videoUrl} target="_blank" rel="noreferrer" className="mt-4 block text-sm text-blue-500 hover:underline">
    Видео-рецепт →
  </a>
)}
```

Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-assistant.service.test.ts`
Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/modules/recipe-drafts/services/recipe-assistant.service.ts src/modules/recipe-drafts/services/recipe-assistant.service.interface.ts src/modules/recipe-drafts/services/recipe-draft.service.ts src/modules/recipe-drafts/services/recipe-draft.service.interface.ts src/modules/recipes/services/recipe.service.ts src/app/recipes/[id]/page.tsx tests/unit/modules/recipe-drafts/recipe-assistant.service.test.ts
git commit -m "feat: add ai-assisted recipe drafts"
```

### Task 5: End-to-end verification

**Files:**
- No new files; verify the touched flow end to end

- [x] **Step 1: Run the full unit test suite**

Run: `pnpm test:run`
Expected: all existing unit tests pass, including the new recipe draft and bot coverage.

- [x] **Step 2: Run the app-level checks**

Run: `pnpm build`
Expected: successful Next.js build with the updated recipe fields and pages.

- [x] **Step 3: Verify the bot entrypoint still boots**

Run: `pnpm bot`
Expected: the process starts without DI errors and logs that the bot is running.
