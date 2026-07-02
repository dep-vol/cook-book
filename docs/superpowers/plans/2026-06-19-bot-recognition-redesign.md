# Bot Recognition Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить бота в «машину распознавания»: любой источник (текст/фото/URL/видео) → единое извлечение → обязательный черновик → ИИ-доработка диалогом → публикация. Ручные кнопки-поля убираются.

**Architecture:** Новый модуль `recognition` (источники-адаптеры + единый `RecipeExtractor` + `RecognitionService`-оркестратор). Новый `DraftRefinementService` для ИИ-доработки через структурированный патч. Бот переписывается в тонкую прослойку над `recognize` / `refine` / `publish`. Старый `recipe-assistant` и кнопочные `pendingAction`-режимы удаляются.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Inversify 8 (DI, `Symbol.for()` токены), Drizzle ORM + PostgreSQL, Zod 4, OpenAI SDK (указывает на OpenRouter через baseURL), grammY (Telegram), Vitest.

## Global Constraints

- **DI:** токены через `Symbol.for()` (не `new Token<T>()`); биндинги в `src/container.ts`; `import 'reflect-metadata'` уже в `container.ts`.
- **Схема Drizzle** живёт в `src/modules/recipes/db/recipe.schema.ts` (все таблицы вместе). Миграции: правим схему → `pnpm db:generate` → `pnpm db:migrate` (программный мигратор `scripts/migrate.ts`).
- **Тесты:** Vitest, `pnpm test:run`. `import 'reflect-metadata'` в `tests/setup.ts`. Алиас `@/` → `src/`.
- **LLM:** один OpenRouter-эндпоинт через OpenAI SDK (`baseURL` + `apiKey`); ответы — JSON, парсятся через `extractJson` + Zod.
- **Черновик создаётся ВСЕГДА** при распознавании, даже при частичном результате (пустые поля = `null`/`[]`).
- **В боте нет ручного редактирования полей**: только распознавание, ИИ-доработка, публикация, удаление.
- **Источники:** текст, фото, URL, видео (видео = описание + субтитры, без скачивания медиа).
- **Язык UI бота:** русский (как в текущем коде).

---

## Task 1: LLMService — конфиг OpenRouter

**Files:**
- Modify: `src/modules/import-jobs/services/llm.service.interface.ts`
- Modify: `src/modules/import-jobs/services/llm.service.ts`
- Modify: `.env.example`
- Test: `tests/unit/import-jobs/llm.service.test.ts` (create)

**Interfaces:**
- Produces: `ILLMService.getLlmBaseUrl(): string`, `getLlmApiKey(): string`, `getRecognitionModel(): string`, `getRefinementModel(): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-jobs/llm.service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LLMService } from '@/modules/import-jobs/services/llm.service'

describe('LLMService OpenRouter config', () => {
  beforeEach(() => {
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
    process.env.OPENROUTER_API_KEY = 'sk-test'
    process.env.RECOGNITION_MODEL = 'google/gemini-3.1-flash-lite'
    process.env.REFINEMENT_MODEL = 'google/gemini-3.1-flash-lite'
  })
  afterEach(() => {
    delete process.env.OPENROUTER_BASE_URL
    delete process.env.OPENROUTER_API_KEY
    delete process.env.RECOGNITION_MODEL
    delete process.env.REFINEMENT_MODEL
  })

  it('reads OpenRouter base url, key and models from env', () => {
    const svc = new LLMService()
    expect(svc.getLlmBaseUrl()).toBe('https://openrouter.ai/api/v1')
    expect(svc.getLlmApiKey()).toBe('sk-test')
    expect(svc.getRecognitionModel()).toBe('google/gemini-3.1-flash-lite')
    expect(svc.getRefinementModel()).toBe('google/gemini-3.1-flash-lite')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/import-jobs/llm.service.test.ts`
Expected: FAIL — `getLlmBaseUrl is not a function`.

- [ ] **Step 3: Add methods to interface**

Append to `src/modules/import-jobs/services/llm.service.interface.ts` inside `ILLMService`:

```ts
  getLlmBaseUrl(): string;
  getLlmApiKey(): string;
  getRecognitionModel(): string;
  getRefinementModel(): string;
```

- [ ] **Step 4: Implement in LLMService**

Append inside the `LLMService` class in `src/modules/import-jobs/services/llm.service.ts`:

```ts
  getLlmBaseUrl(): string {
    return process.env.OPENROUTER_BASE_URL!
  }

  getLlmApiKey(): string {
    return process.env.OPENROUTER_API_KEY!
  }

  getRecognitionModel(): string {
    return process.env.RECOGNITION_MODEL!
  }

  getRefinementModel(): string {
    return process.env.REFINEMENT_MODEL!
  }
```

- [ ] **Step 5: Update .env.example**

Append to `.env.example`:

```
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=
RECOGNITION_MODEL=google/gemini-3.1-flash-lite
REFINEMENT_MODEL=google/gemini-3.1-flash-lite
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test:run tests/unit/import-jobs/llm.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/import-jobs/services/llm.service.interface.ts src/modules/import-jobs/services/llm.service.ts .env.example tests/unit/import-jobs/llm.service.test.ts
git commit -m "feat(llm): add OpenRouter config getters"
```

---

## Task 2: Схема и сущности — additive-миграция

Добавляем `'video'` в enum-источники, поле `pendingSource` в черновик, `draftId` в import_jobs. `pendingAction` пока НЕ трогаем (удалим в Task 8) — чтобы ничего не сломать.

**Files:**
- Modify: `src/modules/recipes/db/recipe.schema.ts`
- Modify: `src/modules/recipe-drafts/entities/recipe-draft.entity.ts`
- Modify: `src/modules/recipe-drafts/repositories/recipe-draft.repository.ts`
- Modify: `src/modules/import-jobs/entities/import-job.entity.ts`
- Modify: `src/modules/import-jobs/repositories/import-job.repository.ts`
- Modify: `src/modules/import-jobs/repositories/import-job.repository.interface.ts`
- Test: `tests/unit/modules/recipe-drafts/recipe-draft.repository.pendingsource.test.ts` (create)

**Interfaces:**
- Produces:
  - `RecipeDraftEntity.sourceType` включает `'video'`.
  - `RecipeDraftEntity.pendingSource: NormalizedContent | null` (тип `NormalizedContent` будет создан в Task 3; пока объяви локальный тип-заглушку в entity, см. ниже — в Task 3 заменим импортом).
  - `IImportJobRepository.create({ sourceType, rawInput, draftId? })` и `updateStatus(id, status, { draftId?, recipeId?, error? })`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/modules/recipe-drafts/recipe-draft.repository.pendingsource.test.ts
import { describe, it, expect } from 'vitest'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

describe('RecipeDraftEntity shape', () => {
  it('allows sourceType "video" and a pendingSource field', () => {
    const draft: Partial<RecipeDraftEntity> = {
      sourceType: 'video',
      pendingSource: { text: 'caption', sourceUrl: 'https://x', images: [], coverImageUrl: undefined },
    }
    expect(draft.sourceType).toBe('video')
    expect(draft.pendingSource?.text).toBe('caption')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/modules/recipe-drafts/recipe-draft.repository.pendingsource.test.ts`
Expected: FAIL — TS error: `'video'` not assignable / `pendingSource` missing.

- [ ] **Step 3: Update entity**

Edit `src/modules/recipe-drafts/entities/recipe-draft.entity.ts`:

```ts
export type RecipeDraftState = 'editing' | 'confirming' | 'saved' | 'expired'
export type RecipeDraftSourceType = 'manual' | 'text' | 'photo' | 'url' | 'video'
export type DraftPendingAction =
  | 'waiting_for_step'
  | 'waiting_for_ingredient'
  | 'waiting_for_photo'
  | 'waiting_for_video'

// Временный локальный тип. В Task 3 заменить на:
//   import type { NormalizedContent } from '@/modules/recognition/sources/source.interface'
export interface DraftPendingSource {
  text?: string
  images?: Array<{ base64: string; mimeType: string }>
  sourceUrl?: string
  coverImageUrl?: string
}

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
  pendingAction: DraftPendingAction | null
  pendingSource: DraftPendingSource | null
  recipeId: string | null
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}
```

- [ ] **Step 4: Update schema**

In `src/modules/recipes/db/recipe.schema.ts`:

Change the two enums:

```ts
export const sourceTypeEnum = pgEnum('source_type', ['photo', 'text', 'url', 'video'])
export const recipeDraftSourceTypeEnum = pgEnum('recipe_draft_source_type', ['manual', 'text', 'photo', 'url', 'video'])
```

In `recipeDrafts` table, after the `pendingAction: text('pending_action'),` line add:

```ts
    pendingSource: jsonb('pending_source').$type<unknown>(),
```

In `importJobs` table, after the `recipeId: ...` line add:

```ts
    draftId: uuid('draft_id').references(() => recipeDrafts.id, { onDelete: 'set null' }),
```

(Note: `importJobs` is declared before `recipeDrafts`. Move the `importJobs` declaration to AFTER `recipeDrafts` so the `recipeDrafts.id` reference resolves. Keep `recipes` first. Final order: `recipes`, `recipeDrafts`, `importJobs`.)

- [ ] **Step 5: Update recipe-draft repository mapping**

In `src/modules/recipe-drafts/repositories/recipe-draft.repository.ts`:

In `mapToEntity`, after the `pendingAction:` line add:

```ts
      pendingSource: (row.pendingSource as RecipeDraftEntity['pendingSource']) ?? null,
```

In `create(...)`, in the `.values({...})` object add (anywhere among the nulls):

```ts
        pendingSource: null,
```

In `update(...)`, after the `pendingAction` mapping line add:

```ts
    if (patch.pendingSource !== undefined) updateData.pendingSource = patch.pendingSource
```

- [ ] **Step 6: Update import-job entity + repo for draftId**

In `src/modules/import-jobs/entities/import-job.entity.ts` add `draftId: string | null` to the entity interface and `'video'` to the `SourceType` union. (Open the file; add the field next to `recipeId` and extend the union — exact lines may vary.)

In `src/modules/import-jobs/repositories/import-job.repository.interface.ts`:

```ts
import type { ImportJobEntity, ImportStatus, SourceType } from '../entities/import-job.entity'

export interface IImportJobRepository {
  create(data: { sourceType: SourceType; rawInput: string; draftId?: string }): Promise<ImportJobEntity>
  findById(id: string): Promise<ImportJobEntity | null>
  updateStatus(
    id: string,
    status: ImportStatus,
    opts?: { recipeId?: string; draftId?: string; error?: string }
  ): Promise<void>
}
```

In `src/modules/import-jobs/repositories/import-job.repository.ts` thread `draftId` through `create` (insert `draft_id`) and `updateStatus` (set `draft_id` when provided), mirroring the existing `recipeId` handling, and map `draftId` in the row→entity mapper.

- [ ] **Step 7: Generate and apply migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: a new migration file under `drizzle/migrations/`, applied without error. (Postgres must be up: `docker compose up -d`.)

- [ ] **Step 8: Run tests**

Run: `pnpm test:run`
Expected: PASS (no compile errors; existing tests still green).

- [ ] **Step 9: Commit**

```bash
git add src/modules/recipes/db/recipe.schema.ts src/modules/recipe-drafts/entities/recipe-draft.entity.ts src/modules/recipe-drafts/repositories/recipe-draft.repository.ts src/modules/import-jobs drizzle/migrations tests/unit/modules/recipe-drafts/recipe-draft.repository.pendingsource.test.ts
git commit -m "feat(db): add video source type, pendingSource, import_jobs.draftId"
```

---

## Task 3: Источники распознавания (sources)

Создаём модуль `recognition` с интерфейсом источника и четырьмя адаптерами. `url`/`video` переиспользуют существующий `CheerioScraper` (DI) — модуль `url-scraper` остаётся низкоуровневым примитивом (DRY; отклонение от спеки в сторону переиспользования).

**Files:**
- Create: `src/modules/recognition/sources/source.interface.ts`
- Create: `src/modules/recognition/sources/text.source.ts`
- Create: `src/modules/recognition/sources/photo.source.ts`
- Create: `src/modules/recognition/sources/url.source.ts`
- Create: `src/modules/recognition/sources/video.source.ts`
- Create: `src/modules/recognition/recognition.tokens.ts`
- Test: `tests/unit/recognition/sources.test.ts`

**Interfaces:**
- Consumes: `IUrlScraper` (`@/modules/url-scraper/url-scraper.interface`) — `scrape(url) → { text, imageUrl? }`.
- Produces:
  - `type RecognitionInput = { kind: 'text'; text: string } | { kind: 'photo'; buffer: Buffer; mimeType: string; caption?: string } | { kind: 'url'; url: string }`
  - `interface NormalizedContent { text?: string; images?: Array<{ base64: string; mimeType: string }>; sourceUrl?: string; coverImageUrl?: string }`
  - `interface IRecognitionSource { detect(input: RecognitionInput): boolean; extract(input: RecognitionInput): Promise<NormalizedContent> }`
  - Source tokens: `TextSourceToken`, `PhotoSourceToken`, `UrlSourceToken`, `VideoSourceToken`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/recognition/sources.test.ts
import { describe, it, expect, vi } from 'vitest'
import { TextSource } from '@/modules/recognition/sources/text.source'
import { PhotoSource } from '@/modules/recognition/sources/photo.source'
import { UrlSource } from '@/modules/recognition/sources/url.source'
import { VideoSource } from '@/modules/recognition/sources/video.source'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'

const scraper: IUrlScraper = { scrape: vi.fn().mockResolvedValue({ text: 'recipe body', imageUrl: 'https://img/cover.jpg' }) }

describe('recognition sources', () => {
  it('TextSource detects text input and passes text through', async () => {
    const s = new TextSource()
    expect(s.detect({ kind: 'text', text: 'hi' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://x' })).toBe(false)
    expect(await s.extract({ kind: 'text', text: 'borsch' })).toEqual({ text: 'borsch' })
  })

  it('PhotoSource detects photo and returns base64 image + caption text', async () => {
    const s = new PhotoSource()
    const input = { kind: 'photo' as const, buffer: Buffer.from('abc'), mimeType: 'image/jpeg', caption: 'cake' }
    expect(s.detect(input)).toBe(true)
    const out = await s.extract(input)
    expect(out.images?.[0]).toEqual({ base64: Buffer.from('abc').toString('base64'), mimeType: 'image/jpeg' })
    expect(out.text).toBe('cake')
  })

  it('UrlSource detects plain http url but NOT video platforms', () => {
    const s = new UrlSource(scraper)
    expect(s.detect({ kind: 'url', url: 'https://eda.ru/recipe/1' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://youtube.com/watch?v=1' })).toBe(false)
    expect(s.detect({ kind: 'text', text: 'x' })).toBe(false)
  })

  it('UrlSource scrapes the page into text + coverImageUrl + sourceUrl', async () => {
    const s = new UrlSource(scraper)
    const out = await s.extract({ kind: 'url', url: 'https://eda.ru/recipe/1' })
    expect(out.text).toBe('recipe body')
    expect(out.coverImageUrl).toBe('https://img/cover.jpg')
    expect(out.sourceUrl).toBe('https://eda.ru/recipe/1')
  })

  it('VideoSource detects youtube/instagram/tiktok urls', () => {
    const s = new VideoSource(scraper)
    expect(s.detect({ kind: 'url', url: 'https://youtu.be/abc' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://www.instagram.com/reel/abc' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://tiktok.com/@u/video/1' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://eda.ru/recipe/1' })).toBe(false)
  })

  it('VideoSource scrapes description and marks it as a video transcript', async () => {
    const s = new VideoSource(scraper)
    const out = await s.extract({ kind: 'url', url: 'https://youtu.be/abc' })
    expect(out.text).toContain('recipe body')
    expect(out.sourceUrl).toBe('https://youtu.be/abc')
    expect(out.coverImageUrl).toBe('https://img/cover.jpg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/recognition/sources.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create source.interface.ts**

```ts
// src/modules/recognition/sources/source.interface.ts
export type RecognitionInput =
  | { kind: 'text'; text: string }
  | { kind: 'photo'; buffer: Buffer; mimeType: string; caption?: string }
  | { kind: 'url'; url: string }

export interface NormalizedContent {
  text?: string
  images?: Array<{ base64: string; mimeType: string }>
  sourceUrl?: string
  coverImageUrl?: string
}

export interface IRecognitionSource {
  detect(input: RecognitionInput): boolean
  extract(input: RecognitionInput): Promise<NormalizedContent>
}

const VIDEO_HOST_RE = /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i

export function isVideoUrl(url: string): boolean {
  return VIDEO_HOST_RE.test(url)
}
```

- [ ] **Step 4: Create text.source.ts**

```ts
// src/modules/recognition/sources/text.source.ts
import { injectable } from 'inversify'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './source.interface'

@injectable()
export class TextSource implements IRecognitionSource {
  detect(input: RecognitionInput): boolean {
    return input.kind === 'text'
  }

  async extract(input: RecognitionInput): Promise<NormalizedContent> {
    if (input.kind !== 'text') throw new Error('TextSource expects text input')
    return { text: input.text }
  }
}
```

- [ ] **Step 5: Create photo.source.ts**

```ts
// src/modules/recognition/sources/photo.source.ts
import { injectable } from 'inversify'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './source.interface'

@injectable()
export class PhotoSource implements IRecognitionSource {
  detect(input: RecognitionInput): boolean {
    return input.kind === 'photo'
  }

  async extract(input: RecognitionInput): Promise<NormalizedContent> {
    if (input.kind !== 'photo') throw new Error('PhotoSource expects photo input')
    return {
      images: [{ base64: input.buffer.toString('base64'), mimeType: input.mimeType }],
      text: input.caption,
    }
  }
}
```

- [ ] **Step 6: Create url.source.ts**

```ts
// src/modules/recognition/sources/url.source.ts
import { inject, injectable } from 'inversify'
import { UrlScraperToken } from '@/tokens/url-scraper.tokens'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './source.interface'
import { isVideoUrl } from './source.interface'

@injectable()
export class UrlSource implements IRecognitionSource {
  constructor(@inject(UrlScraperToken) private readonly scraper: IUrlScraper) {}

  detect(input: RecognitionInput): boolean {
    return input.kind === 'url' && !isVideoUrl(input.url)
  }

  async extract(input: RecognitionInput): Promise<NormalizedContent> {
    if (input.kind !== 'url') throw new Error('UrlSource expects url input')
    const { text, imageUrl } = await this.scraper.scrape(input.url)
    return { text, coverImageUrl: imageUrl, sourceUrl: input.url }
  }
}
```

- [ ] **Step 7: Create video.source.ts**

```ts
// src/modules/recognition/sources/video.source.ts
import { inject, injectable } from 'inversify'
import { UrlScraperToken } from '@/tokens/url-scraper.tokens'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './source.interface'
import { isVideoUrl } from './source.interface'

@injectable()
export class VideoSource implements IRecognitionSource {
  constructor(@inject(UrlScraperToken) private readonly scraper: IUrlScraper) {}

  detect(input: RecognitionInput): boolean {
    return input.kind === 'url' && isVideoUrl(input.url)
  }

  async extract(input: RecognitionInput): Promise<NormalizedContent> {
    if (input.kind !== 'url') throw new Error('VideoSource expects url input')
    const { text, imageUrl } = await this.scraper.scrape(input.url)
    return {
      text: `Описание/субтитры видео:\n${text}`,
      coverImageUrl: imageUrl,
      sourceUrl: input.url,
    }
  }
}
```

- [ ] **Step 8: Create recognition.tokens.ts**

```ts
// src/modules/recognition/recognition.tokens.ts
import type { ServiceIdentifier } from 'inversify'
import type { IRecognitionSource } from './sources/source.interface'

export const TextSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('TextSource')
export const PhotoSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('PhotoSource')
export const UrlSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('UrlSource')
export const VideoSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('VideoSource')
```

- [ ] **Step 9: Replace the temporary type in the draft entity**

In `src/modules/recipe-drafts/entities/recipe-draft.entity.ts` remove the `DraftPendingSource` interface and instead import + use `NormalizedContent`:

```ts
import type { NormalizedContent } from '@/modules/recognition/sources/source.interface'
```

and change the field to:

```ts
  pendingSource: NormalizedContent | null
```

(Update the test from Task 2 only if its inline object no longer matches — the object `{ text, sourceUrl, images, coverImageUrl }` is still valid `NormalizedContent`, so it stays green.)

- [ ] **Step 10: Run tests**

Run: `pnpm test:run tests/unit/recognition/sources.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/modules/recognition/sources src/modules/recognition/recognition.tokens.ts src/modules/recipe-drafts/entities/recipe-draft.entity.ts tests/unit/recognition/sources.test.ts
git commit -m "feat(recognition): add input source adapters"
```

---

## Task 4: RecipeExtractor — единое LLM-извлечение

Один мультимодальный вызов OpenRouter: `NormalizedContent` → `ExtractedRecipe` (частичный результат допустим).

**Files:**
- Create: `src/modules/recognition/extractor/recipe-extractor.interface.ts`
- Create: `src/modules/recognition/extractor/recipe-extractor.ts`
- Modify: `src/modules/recognition/recognition.tokens.ts`
- Test: `tests/unit/recognition/recipe-extractor.test.ts`

**Interfaces:**
- Consumes: `ILLMService.getLlmBaseUrl/getLlmApiKey/getRecognitionModel`; `NormalizedContent`.
- Produces:
  - `interface ExtractedRecipe { title: string | null; ingredients: Array<{ name: string; amount: string; unit: string }>; steps: Array<{ order: number; text: string }>; cookTimeMinutes: number | null; servings: number | null; tags: string[] }`
  - `interface IRecipeExtractor { extract(content: NormalizedContent): Promise<ExtractedRecipe> }`
  - `RecipeExtractorToken`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/recognition/recipe-extractor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: createMock } } },
}))

import { RecipeExtractor } from '@/modules/recognition/extractor/recipe-extractor'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'

const llm = {
  getLlmBaseUrl: () => 'https://openrouter.ai/api/v1',
  getLlmApiKey: () => 'sk',
  getRecognitionModel: () => 'google/gemini-3.1-flash-lite',
} as unknown as ILLMService

function reply(content: string) {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content } }] })
}

describe('RecipeExtractor', () => {
  beforeEach(() => createMock.mockReset())

  it('parses a full recipe JSON', async () => {
    reply(JSON.stringify({
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать' }],
      cookTimeMinutes: 90, servings: 4, tags: ['суп'],
    }))
    const out = await new RecipeExtractor(llm).extract({ text: 'борщ ...' })
    expect(out.title).toBe('Борщ')
    expect(out.ingredients).toHaveLength(1)
    expect(out.steps[0].order).toBe(1)
  })

  it('accepts a partial result (null title, empty arrays)', async () => {
    reply(JSON.stringify({ title: null, ingredients: [], steps: [], cookTimeMinutes: null, servings: null, tags: [] }))
    const out = await new RecipeExtractor(llm).extract({ text: 'непонятно' })
    expect(out.title).toBeNull()
    expect(out.ingredients).toEqual([])
    expect(out.steps).toEqual([])
  })

  it('sends image content parts when images are present', async () => {
    reply(JSON.stringify({ title: 'X', ingredients: [], steps: [], cookTimeMinutes: null, servings: null, tags: [] }))
    await new RecipeExtractor(llm).extract({ images: [{ base64: 'AAAA', mimeType: 'image/png' }] })
    const sent = createMock.mock.calls[0][0]
    const userMsg = sent.messages.find((m: { role: string }) => m.role === 'user')
    const hasImage = JSON.stringify(userMsg.content).includes('data:image/png;base64,AAAA')
    expect(hasImage).toBe(true)
  })

  it('throws on empty LLM response', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
    await expect(new RecipeExtractor(llm).extract({ text: 'x' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/recognition/recipe-extractor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create recipe-extractor.interface.ts**

```ts
// src/modules/recognition/extractor/recipe-extractor.interface.ts
import type { NormalizedContent } from '../sources/source.interface'

export interface ExtractedRecipe {
  title: string | null
  ingredients: Array<{ name: string; amount: string; unit: string }>
  steps: Array<{ order: number; text: string }>
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
}

export interface IRecipeExtractor {
  extract(content: NormalizedContent): Promise<ExtractedRecipe>
}
```

- [ ] **Step 4: Create recipe-extractor.ts**

```ts
// src/modules/recognition/extractor/recipe-extractor.ts
import { inject, injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import { LLMServiceToken } from '@/tokens/import-job.tokens'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'
import type { NormalizedContent } from '../sources/source.interface'
import type { ExtractedRecipe, IRecipeExtractor } from './recipe-extractor.interface'

const ExtractedRecipeSchema = z.object({
  title: z.string().min(1).nullable().default(null),
  ingredients: z.array(z.object({
    name: z.string().min(1),
    amount: z.coerce.string().nullable().transform(v => v ?? ''),
    unit: z.string().nullable().transform(v => v ?? ''),
  })).default([]),
  steps: z.array(z.object({
    order: z.coerce.number().int().positive(),
    text: z.string().min(1),
  })).default([]),
  cookTimeMinutes: z.coerce.number().int().positive().nullable().default(null),
  servings: z.coerce.number().int().positive().nullable().default(null),
  tags: z.array(z.string()).default([]),
})

function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

const SYSTEM_PROMPT = `You extract a cooking recipe from the user's input (text and/or images of a recipe page, screenshot, dish, or video description/subtitles). Respond with a JSON object ONLY (no markdown), with this exact shape:
{"title": "name or null", "ingredients": [{"name": "...", "amount": "100", "unit": "г"}], "steps": [{"order": 1, "text": "..."}], "cookTimeMinutes": 30, "servings": 4, "tags": ["..."]}
Rules:
- Extract only what is actually present. If something is unknown: title=null, unknown numbers=null, missing lists=[].
- Never invent ingredients or steps that are not implied by the input.
- steps[].order starts at 1 and increments by 1.
- Tags are short keywords in the language of the recipe.
- Output valid JSON only.`

@injectable()
export class RecipeExtractor implements IRecipeExtractor {
  constructor(@inject(LLMServiceToken) private readonly llm: ILLMService) {}

  async extract(content: NormalizedContent): Promise<ExtractedRecipe> {
    const client = new OpenAI({ baseURL: this.llm.getLlmBaseUrl(), apiKey: this.llm.getLlmApiKey() })

    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []
    if (content.text) parts.push({ type: 'text', text: content.text })
    for (const img of content.images ?? []) {
      parts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })
    }
    if (parts.length === 0) parts.push({ type: 'text', text: 'No content provided.' })

    const response = await client.chat.completions.create({
      model: this.llm.getRecognitionModel(),
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: parts },
      ],
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('LLM returned empty response')
    return ExtractedRecipeSchema.parse(extractJson(raw))
  }
}
```

- [ ] **Step 5: Add token**

Append to `src/modules/recognition/recognition.tokens.ts`:

```ts
import type { IRecipeExtractor } from './extractor/recipe-extractor.interface'

export const RecipeExtractorToken: ServiceIdentifier<IRecipeExtractor> = Symbol.for('RecipeExtractor')
```

(Add `ServiceIdentifier` to the existing import if not already there.)

- [ ] **Step 6: Run tests**

Run: `pnpm test:run tests/unit/recognition/recipe-extractor.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/recognition/extractor src/modules/recognition/recognition.tokens.ts tests/unit/recognition/recipe-extractor.test.ts
git commit -m "feat(recognition): add unified recipe extractor"
```

---

## Task 5: RecognitionService — оркестратор

Выбирает источник по входу, извлекает контент, гоняет экстрактор, создаёт + наполняет черновик, грузит обложку, логирует попытку в import_jobs. Плюс хелперы для развилки merge/new.

**Files:**
- Create: `src/modules/recognition/recognition.service.interface.ts`
- Create: `src/modules/recognition/recognition.service.ts`
- Modify: `src/modules/recognition/recognition.tokens.ts`
- Test: `tests/unit/recognition/recognition.service.test.ts`

**Interfaces:**
- Consumes: source tokens (4×`IRecognitionSource`), `RecipeExtractorToken`, `RecipeDraftServiceToken` (`createDraft`, `updateDraft`), `ImportJobRepositoryToken` (`create`, `updateStatus`), `uploadImage` from `@/lib/minio`.
- Produces:
  - `interface RecognitionContext { channel: string; chatId: string; userId: string }`
  - `interface IRecognitionService {`
    - `recognize(input: RecognitionInput, ctx: RecognitionContext): Promise<RecipeDraftEntity>`
    - `toContent(input: RecognitionInput): Promise<NormalizedContent>`
    - `createDraftFromContent(content: NormalizedContent, sourceType: RecipeDraftSourceType, ctx: RecognitionContext): Promise<RecipeDraftEntity>`
    - `mergeContentIntoDraft(draft: RecipeDraftEntity, content: NormalizedContent): Promise<{ draft: RecipeDraftEntity; summary: string }>`
  - `}`
  - `RecognitionServiceToken`.
- `sourceTypeOf(input)`: text→'text', photo→'photo', url→ video?'video':'url'.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/recognition/recognition.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/minio', () => ({ uploadImage: vi.fn().mockResolvedValue('cover-key') }))
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true, arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => 'image/jpeg' },
}) as unknown as typeof fetch

import { RecognitionService } from '@/modules/recognition/recognition.service'
import type { IRecognitionSource, NormalizedContent } from '@/modules/recognition/sources/source.interface'
import type { IRecipeExtractor } from '@/modules/recognition/extractor/recipe-extractor.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const baseDraft: RecipeDraftEntity = {
  id: 'd1', channel: 'telegram', channelChatId: 'c', channelUserId: 'u', state: 'editing',
  sourceType: 'text', title: null, ingredients: [], steps: [], cookTimeMinutes: null, servings: null,
  tags: [], sourceText: null, sourceUrl: null, coverImageKey: null, videoUrl: null,
  lastAiSuggestion: null, pendingAction: null, pendingSource: null, recipeId: null,
  createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(),
}

function src(kind: string, content: NormalizedContent): IRecognitionSource {
  return { detect: (i) => i.kind === kind, extract: vi.fn().mockResolvedValue(content) }
}

const extractor: IRecipeExtractor = {
  extract: vi.fn().mockResolvedValue({
    title: 'Борщ', ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
    steps: [{ order: 1, text: 'Варить' }], cookTimeMinutes: 90, servings: 4, tags: ['суп'],
  }),
}

const draftService = {
  createDraft: vi.fn().mockResolvedValue(baseDraft),
  updateDraft: vi.fn().mockImplementation(async (_id, patch) => ({ ...baseDraft, ...patch })),
} as unknown as IRecipeDraftService

const jobRepo = {
  create: vi.fn().mockResolvedValue({ id: 'j1' }),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  findById: vi.fn(),
} as unknown as IImportJobRepository

function makeService() {
  return new RecognitionService(
    src('text', { text: 't' }),
    src('photo', { images: [{ base64: 'AA', mimeType: 'image/png' }] }),
    src('url', { text: 'u', coverImageUrl: 'https://img/c.jpg', sourceUrl: 'https://eda.ru/1' }),
    src('url', { text: 'v', sourceUrl: 'https://youtu.be/x' }), // video source also kind 'url'
    extractor, draftService, jobRepo,
  )
}

describe('RecognitionService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recognize: creates a draft populated with extracted fields and logs the job', async () => {
    const svc = makeService()
    const draft = await svc.recognize({ kind: 'text', text: 'борщ' }, { channel: 'telegram', chatId: 'c', userId: 'u' })
    expect(draftService.createDraft).toHaveBeenCalled()
    expect(draftService.updateDraft).toHaveBeenCalled()
    expect(draft.title).toBe('Борщ')
    expect(jobRepo.updateStatus).toHaveBeenCalledWith('j1', 'done', expect.objectContaining({ draftId: 'd1' }))
  })

  it('mergeContentIntoDraft: appends ingredients/steps and fills empty fields', async () => {
    const svc = makeService()
    const existing = { ...baseDraft, ingredients: [{ name: 'Соль', amount: '1', unit: 'щепотка' }], steps: [{ order: 1, text: 'Старый' }] }
    const { draft, summary } = await svc.mergeContentIntoDraft(existing, { text: 'добавка' })
    expect(draft.ingredients).toHaveLength(2)
    expect(draft.steps).toHaveLength(2)
    expect(draft.steps[1].order).toBe(2)
    expect(draft.title).toBe('Борщ') // was null → filled
    expect(summary).toContain('ингредиент')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/recognition/recognition.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create recognition.service.interface.ts**

```ts
// src/modules/recognition/recognition.service.interface.ts
import type { NormalizedContent, RecognitionInput } from './sources/source.interface'
import type { RecipeDraftEntity, RecipeDraftSourceType } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

export interface RecognitionContext {
  channel: string
  chatId: string
  userId: string
}

export interface IRecognitionService {
  recognize(input: RecognitionInput, ctx: RecognitionContext): Promise<RecipeDraftEntity>
  toContent(input: RecognitionInput): Promise<NormalizedContent>
  createDraftFromContent(content: NormalizedContent, sourceType: RecipeDraftSourceType, ctx: RecognitionContext): Promise<RecipeDraftEntity>
  mergeContentIntoDraft(draft: RecipeDraftEntity, content: NormalizedContent): Promise<{ draft: RecipeDraftEntity; summary: string }>
}
```

- [ ] **Step 4: Create recognition.service.ts**

```ts
// src/modules/recognition/recognition.service.ts
import { inject, injectable } from 'inversify'
import { uploadImage } from '@/lib/minio'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { ImportJobRepositoryToken } from '@/tokens/import-job.tokens'
import { TextSourceToken, PhotoSourceToken, UrlSourceToken, VideoSourceToken, RecipeExtractorToken } from './recognition.tokens'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './sources/source.interface'
import type { IRecipeExtractor, ExtractedRecipe } from './extractor/recipe-extractor.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { RecipeDraftEntity, RecipeDraftSourceType } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { IRecognitionService, RecognitionContext } from './recognition.service.interface'
import { isVideoUrl } from './sources/source.interface'

@injectable()
export class RecognitionService implements IRecognitionService {
  private readonly sources: IRecognitionSource[]

  constructor(
    @inject(TextSourceToken) text: IRecognitionSource,
    @inject(PhotoSourceToken) photo: IRecognitionSource,
    @inject(UrlSourceToken) url: IRecognitionSource,
    @inject(VideoSourceToken) video: IRecognitionSource,
    @inject(RecipeExtractorToken) private readonly extractor: IRecipeExtractor,
    @inject(RecipeDraftServiceToken) private readonly drafts: IRecipeDraftService,
    @inject(ImportJobRepositoryToken) private readonly jobs: IImportJobRepository,
  ) {
    // порядок важен: video и url оба обрабатывают kind 'url'; video.detect отсеивает по хосту
    this.sources = [text, photo, video, url]
  }

  async toContent(input: RecognitionInput): Promise<NormalizedContent> {
    const source = this.sources.find(s => s.detect(input))
    if (!source) throw new Error(`No recognition source for input kind: ${input.kind}`)
    return source.extract(input)
  }

  async recognize(input: RecognitionInput, ctx: RecognitionContext): Promise<RecipeDraftEntity> {
    const sourceType = this.sourceTypeOf(input)
    const job = await this.jobs.create({ sourceType, rawInput: this.rawInputOf(input) })
    try {
      const content = await this.toContent(input)
      const draft = await this.createDraftFromContent(content, sourceType, ctx)
      await this.jobs.updateStatus(job.id, 'done', { draftId: draft.id })
      return draft
    } catch (err) {
      await this.jobs.updateStatus(job.id, 'failed', { error: err instanceof Error ? err.message : 'Unknown error' })
      throw err
    }
  }

  async createDraftFromContent(content: NormalizedContent, sourceType: RecipeDraftSourceType, ctx: RecognitionContext): Promise<RecipeDraftEntity> {
    const extracted = await this.extractor.extract(content)
    const draft = await this.drafts.createDraft({
      channel: ctx.channel, channelChatId: ctx.chatId, channelUserId: ctx.userId, sourceType,
    })
    const coverImageKey = await this.uploadCover(content)
    return this.drafts.updateDraft(draft.id, {
      ...this.toPatch(extracted),
      sourceText: content.text ?? null,
      sourceUrl: content.sourceUrl ?? null,
      coverImageKey,
    })
  }

  async mergeContentIntoDraft(draft: RecipeDraftEntity, content: NormalizedContent): Promise<{ draft: RecipeDraftEntity; summary: string }> {
    const extracted = await this.extractor.extract(content)
    const lines: string[] = []
    const patch: Partial<RecipeDraftEntity> = {}

    if (extracted.ingredients.length) {
      patch.ingredients = [...draft.ingredients, ...extracted.ingredients]
      lines.push(`🥕 +${extracted.ingredients.length} ингредиент(ов)`)
    }
    if (extracted.steps.length) {
      patch.steps = [...draft.steps, ...extracted.steps.map((s, i) => ({ order: draft.steps.length + i + 1, text: s.text }))]
      lines.push(`📝 +${extracted.steps.length} шаг(ов)`)
    }
    if (extracted.title && !draft.title) { patch.title = extracted.title; lines.push(`📌 Название: ${extracted.title}`) }
    if (extracted.cookTimeMinutes && !draft.cookTimeMinutes) { patch.cookTimeMinutes = extracted.cookTimeMinutes; lines.push(`⏱ ${extracted.cookTimeMinutes} мин`) }
    if (extracted.servings && !draft.servings) { patch.servings = extracted.servings; lines.push(`🍽 ${extracted.servings} порц.`) }
    if (extracted.tags.length && !draft.tags.length) { patch.tags = extracted.tags; lines.push(`🏷 ${extracted.tags.join(', ')}`) }

    const cover = draft.coverImageKey ? null : await this.uploadCover(content)
    if (cover) patch.coverImageKey = cover

    const updated = Object.keys(patch).length ? await this.drafts.updateDraft(draft.id, patch) : draft
    return { draft: updated, summary: lines.length ? lines.join('\n') : 'Нечего добавить из этого источника.' }
  }

  private toPatch(e: ExtractedRecipe): Partial<RecipeDraftEntity> {
    return {
      title: e.title, ingredients: e.ingredients, steps: e.steps,
      cookTimeMinutes: e.cookTimeMinutes, servings: e.servings, tags: e.tags,
    }
  }

  private async uploadCover(content: NormalizedContent): Promise<string | null> {
    try {
      if (content.coverImageUrl) {
        const res = await fetch(content.coverImageUrl)
        if (!res.ok) return null
        const buffer = Buffer.from(await res.arrayBuffer())
        return uploadImage(buffer, res.headers.get('content-type') ?? 'image/jpeg')
      }
      if (content.images?.length) {
        const [img] = content.images
        return uploadImage(Buffer.from(img.base64, 'base64'), img.mimeType)
      }
    } catch {
      return null
    }
    return null
  }

  private sourceTypeOf(input: RecognitionInput): RecipeDraftSourceType {
    if (input.kind === 'text') return 'text'
    if (input.kind === 'photo') return 'photo'
    return isVideoUrl(input.url) ? 'video' : 'url'
  }

  private rawInputOf(input: RecognitionInput): string {
    if (input.kind === 'text') return input.text
    if (input.kind === 'url') return input.url
    return input.caption ?? '[photo]'
  }
}
```

- [ ] **Step 5: Add token**

Append to `src/modules/recognition/recognition.tokens.ts`:

```ts
import type { IRecognitionService } from './recognition.service.interface'

export const RecognitionServiceToken: ServiceIdentifier<IRecognitionService> = Symbol.for('RecognitionService')
```

- [ ] **Step 6: Run tests**

Run: `pnpm test:run tests/unit/recognition/recognition.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire DI for the whole recognition module**

In `src/container.ts` add imports and bindings:

```ts
import { TextSourceToken, PhotoSourceToken, UrlSourceToken, VideoSourceToken, RecipeExtractorToken, RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { TextSource } from '@/modules/recognition/sources/text.source'
import { PhotoSource } from '@/modules/recognition/sources/photo.source'
import { UrlSource } from '@/modules/recognition/sources/url.source'
import { VideoSource } from '@/modules/recognition/sources/video.source'
import { RecipeExtractor } from '@/modules/recognition/extractor/recipe-extractor'
import { RecognitionService } from '@/modules/recognition/recognition.service'
```

```ts
container.bind(TextSourceToken).to(TextSource).inSingletonScope()
container.bind(PhotoSourceToken).to(PhotoSource).inSingletonScope()
container.bind(UrlSourceToken).to(UrlSource).inSingletonScope()
container.bind(VideoSourceToken).to(VideoSource).inSingletonScope()
container.bind(RecipeExtractorToken).to(RecipeExtractor).inSingletonScope()
container.bind(RecognitionServiceToken).to(RecognitionService).inSingletonScope()
```

- [ ] **Step 8: Run full suite**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/recognition/recognition.service.ts src/modules/recognition/recognition.service.interface.ts src/modules/recognition/recognition.tokens.ts src/container.ts tests/unit/recognition/recognition.service.test.ts
git commit -m "feat(recognition): add RecognitionService orchestrator + DI"
```

---

## Task 6: DraftRefinementService — ИИ-доработка

Структурированный патч от LLM применяется к черновику чистой логикой `applyOperations`.

**Files:**
- Create: `src/modules/recipe-drafts/services/draft-refinement.service.interface.ts`
- Create: `src/modules/recipe-drafts/services/draft-refinement.service.ts`
- Modify: `src/tokens/recipe-draft.tokens.ts`
- Test: `tests/unit/modules/recipe-drafts/draft-refinement.service.test.ts`

**Interfaces:**
- Consumes: `ILLMService.getLlmBaseUrl/getLlmApiKey/getRefinementModel`; `RecipeDraftServiceToken.updateDraft`.
- Produces:
  - `interface RefineMessage { text?: string; image?: { base64: string; mimeType: string } }`
  - `interface RefineResult { draft: RecipeDraftEntity; summary: string; answer?: string }`
  - `interface IDraftRefinementService { refine(draft: RecipeDraftEntity, message: RefineMessage): Promise<RefineResult> }`
  - Exported pure helper `applyOperations(draft, operations): Partial<RecipeDraftEntity>`.
  - `DraftRefinementServiceToken`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/modules/recipe-drafts/draft-refinement.service.test.ts
import { describe, it, expect } from 'vitest'
import { applyOperations } from '@/modules/recipe-drafts/services/draft-refinement.service'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const draft: RecipeDraftEntity = {
  id: 'd', channel: 'telegram', channelChatId: 'c', channelUserId: 'u', state: 'editing',
  sourceType: 'text', title: 'Старое', ingredients: [{ name: 'Соль', amount: '1', unit: 'щ' }],
  steps: [{ order: 1, text: 'A' }, { order: 2, text: 'B' }], cookTimeMinutes: null, servings: null,
  tags: [], sourceText: null, sourceUrl: null, coverImageKey: null, videoUrl: null,
  lastAiSuggestion: null, pendingAction: null, pendingSource: null, recipeId: null,
  createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(),
}

describe('applyOperations', () => {
  it('set_field updates title', () => {
    const p = applyOperations(draft, [{ op: 'set_field', field: 'title', value: 'Новое' }])
    expect(p.title).toBe('Новое')
  })

  it('add_ingredients appends', () => {
    const p = applyOperations(draft, [{ op: 'add_ingredients', items: [{ name: 'Мука', amount: '200', unit: 'г' }] }])
    expect(p.ingredients).toHaveLength(2)
  })

  it('remove_ingredient by index', () => {
    const p = applyOperations(draft, [{ op: 'remove_ingredient', index: 0 }])
    expect(p.ingredients).toHaveLength(0)
  })

  it('remove_step renumbers remaining steps from 1', () => {
    const p = applyOperations(draft, [{ op: 'remove_step', order: 1 }])
    expect(p.steps).toEqual([{ order: 1, text: 'B' }])
  })

  it('add_steps renumbers continuing from existing', () => {
    const p = applyOperations(draft, [{ op: 'add_steps', items: [{ order: 99, text: 'C' }] }])
    expect(p.steps).toEqual([{ order: 1, text: 'A' }, { order: 2, text: 'B' }, { order: 3, text: 'C' }])
  })

  it('set_tags replaces tags', () => {
    const p = applyOperations(draft, [{ op: 'set_tags', tags: ['x', 'y'] }])
    expect(p.tags).toEqual(['x', 'y'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/unit/modules/recipe-drafts/draft-refinement.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create draft-refinement.service.interface.ts**

```ts
// src/modules/recipe-drafts/services/draft-refinement.service.interface.ts
import type { RecipeDraftEntity } from '../entities/recipe-draft.entity'

export interface RefineMessage {
  text?: string
  image?: { base64: string; mimeType: string }
}

export interface RefineResult {
  draft: RecipeDraftEntity
  summary: string
  answer?: string
}

export interface IDraftRefinementService {
  refine(draft: RecipeDraftEntity, message: RefineMessage): Promise<RefineResult>
}
```

- [ ] **Step 4: Create draft-refinement.service.ts**

```ts
// src/modules/recipe-drafts/services/draft-refinement.service.ts
import { inject, injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import { LLMServiceToken } from '@/tokens/import-job.tokens'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'
import type { IRecipeDraftService } from './recipe-draft.service.interface'
import type { RecipeDraftEntity } from '../entities/recipe-draft.entity'
import type { IDraftRefinementService, RefineMessage, RefineResult } from './draft-refinement.service.interface'

const IngredientSchema = z.object({ name: z.string().min(1), amount: z.coerce.string().default(''), unit: z.string().default('') })
const StepSchema = z.object({ order: z.coerce.number().int().positive(), text: z.string().min(1) })

const OperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_field'), field: z.enum(['title', 'cookTimeMinutes', 'servings']), value: z.union([z.string(), z.number(), z.null()]) }),
  z.object({ op: z.literal('set_tags'), tags: z.array(z.string()) }),
  z.object({ op: z.literal('add_ingredients'), items: z.array(IngredientSchema) }),
  z.object({ op: z.literal('remove_ingredient'), index: z.coerce.number().int().nonnegative() }),
  z.object({ op: z.literal('replace_ingredients'), items: z.array(IngredientSchema) }),
  z.object({ op: z.literal('add_steps'), items: z.array(StepSchema) }),
  z.object({ op: z.literal('remove_step'), order: z.coerce.number().int().positive() }),
  z.object({ op: z.literal('replace_steps'), items: z.array(StepSchema) }),
])

export type RefineOperation = z.infer<typeof OperationSchema>

const RefinementResultSchema = z.object({
  operations: z.array(OperationSchema).default([]),
  answer: z.string().optional(),
  summary: z.string().default(''),
})

function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

function renumber(steps: Array<{ order: number; text: string }>): Array<{ order: number; text: string }> {
  return steps.map((s, i) => ({ order: i + 1, text: s.text }))
}

/** Чистая логика применения операций. Возвращает патч для updateDraft. */
export function applyOperations(draft: RecipeDraftEntity, operations: RefineOperation[]): Partial<RecipeDraftEntity> {
  let ingredients = [...draft.ingredients]
  let steps = [...draft.steps]
  const patch: Partial<RecipeDraftEntity> = {}

  for (const op of operations) {
    switch (op.op) {
      case 'set_field':
        if (op.field === 'title') patch.title = op.value === null ? null : String(op.value)
        else patch[op.field] = op.value === null ? null : Number(op.value)
        break
      case 'set_tags': patch.tags = op.tags; break
      case 'add_ingredients': ingredients = [...ingredients, ...op.items]; break
      case 'remove_ingredient': ingredients = ingredients.filter((_, i) => i !== op.index); break
      case 'replace_ingredients': ingredients = [...op.items]; break
      case 'add_steps': steps = renumber([...steps, ...op.items]); break
      case 'remove_step': steps = renumber(steps.filter(s => s.order !== op.order)); break
      case 'replace_steps': steps = renumber(op.items); break
    }
  }

  if (ingredients !== draft.ingredients) patch.ingredients = ingredients
  if (steps !== draft.steps) patch.steps = steps
  return patch
}

const SYSTEM_PROMPT = `You help refine a recipe DRAFT. You receive the current draft as JSON and the user's message (text and/or an image). Decide how to change the draft and respond with JSON ONLY:
{"operations": [...], "answer": "optional answer if the user asked a question", "summary": "short human summary of changes in Russian"}
Allowed operations:
- {"op":"set_field","field":"title|cookTimeMinutes|servings","value": string|number|null}
- {"op":"set_tags","tags":["..."]}
- {"op":"add_ingredients","items":[{"name","amount","unit"}]}
- {"op":"remove_ingredient","index":0}
- {"op":"replace_ingredients","items":[...]}
- {"op":"add_steps","items":[{"order":1,"text":"..."}]}
- {"op":"remove_step","order":1}
- {"op":"replace_steps","items":[...]}
Rules:
- Only output operations that reflect the user's intent. If it's only a question, use "answer" and empty operations.
- "summary" must be in Russian, one short line.
- Output valid JSON only.`

@injectable()
export class DraftRefinementService implements IDraftRefinementService {
  constructor(
    @inject(LLMServiceToken) private readonly llm: ILLMService,
    @inject(RecipeDraftServiceToken) private readonly drafts: IRecipeDraftService,
  ) {}

  async refine(draft: RecipeDraftEntity, message: RefineMessage): Promise<RefineResult> {
    const client = new OpenAI({ baseURL: this.llm.getLlmBaseUrl(), apiKey: this.llm.getLlmApiKey() })

    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: `Текущий черновик:\n${JSON.stringify(this.draftForPrompt(draft))}` },
    ]
    if (message.text) parts.push({ type: 'text', text: `Сообщение пользователя: ${message.text}` })
    if (message.image) parts.push({ type: 'image_url', image_url: { url: `data:${message.image.mimeType};base64,${message.image.base64}` } })

    const response = await client.chat.completions.create({
      model: this.llm.getRefinementModel(),
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: parts },
      ],
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('LLM returned empty response')
    const result = RefinementResultSchema.parse(extractJson(raw))

    const patch = applyOperations(draft, result.operations)
    const updated = Object.keys(patch).length ? await this.drafts.updateDraft(draft.id, patch) : draft
    const summary = result.summary || (result.answer ? '' : 'Изменений не внесено.')
    return { draft: updated, summary, answer: result.answer }
  }

  private draftForPrompt(draft: RecipeDraftEntity) {
    return {
      title: draft.title, ingredients: draft.ingredients, steps: draft.steps,
      cookTimeMinutes: draft.cookTimeMinutes, servings: draft.servings, tags: draft.tags,
    }
  }
}
```

- [ ] **Step 5: Add token**

In `src/tokens/recipe-draft.tokens.ts` add:

```ts
import type { IDraftRefinementService } from '@/modules/recipe-drafts/services/draft-refinement.service.interface'

export const DraftRefinementServiceToken: ServiceIdentifier<IDraftRefinementService> = Symbol.for('DraftRefinementService')
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test:run tests/unit/modules/recipe-drafts/draft-refinement.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire DI**

In `src/container.ts` add:

```ts
import { DraftRefinementServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftRefinementService } from '@/modules/recipe-drafts/services/draft-refinement.service'
```

```ts
container.bind(DraftRefinementServiceToken).to(DraftRefinementService).inSingletonScope()
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/recipe-drafts/services/draft-refinement.service.ts src/modules/recipe-drafts/services/draft-refinement.service.interface.ts src/tokens/recipe-draft.tokens.ts src/container.ts tests/unit/modules/recipe-drafts/draft-refinement.service.test.ts
git commit -m "feat(drafts): add AI DraftRefinementService"
```

---

## Task 7: Переписать слой бота

Рендерер (новые кнопки), `draft.handler` (тонкая прослойка над recognize/refine), `callback.handler` (publish/discard/merge-new), `recipe-bot` (новая маршрутизация), `scripts/bot.ts` + DI. Новый код использует `pendingSource`, `recognize`, `refine`. НЕ использует `assistant`/`pendingAction`.

**Files:**
- Modify: `src/modules/bot/renderer/draft.renderer.ts`
- Modify: `src/modules/bot/handlers/draft.handler.ts`
- Modify: `src/modules/bot/handlers/draft.handler.interface.ts`
- Modify: `src/modules/bot/handlers/callback.handler.ts`
- Modify: `src/modules/bot/recipe-bot.ts`
- Modify: `src/modules/bot/bot.tokens.ts`
- Modify: `src/container.ts`
- Modify: `scripts/bot.ts`
- Test: `tests/unit/bot/handlers/draft.handler.test.ts` (rewrite), `tests/unit/bot/handlers/callback.handler.test.ts` (rewrite), `tests/unit/bot/renderer/draft.renderer.test.ts` (update)

**Interfaces:**
- Consumes: `RecognitionServiceToken` (`recognize`, `toContent`, `createDraftFromContent`, `mergeContentIntoDraft`), `DraftRefinementServiceToken` (`refine`), `RecipeDraftServiceToken` (`getActiveDraft`, `updateDraft`, `setConfirming`, `saveDraft`, `discardDraft`), `DraftRendererToken`.
- Produces:
  - `IDraftHandler.handleText(draft, text, setStatus?) → string`, `handlePhoto(draft, buffer, mimeType, caption?, setStatus?) → string`.
  - Renderer: `renderDraftMenuButtons(draftId)` returns only `[Опубликовать]`, `[Удалить]`; new `renderSourceDecisionButtons(draftId)` returns `[Дополнить текущий]`, `[Новый рецепт]`.

- [ ] **Step 1: Rewrite renderer**

Replace `renderDraftMenuButtons` and `renderUnknownCallback` and add a decision-buttons method in `src/modules/bot/renderer/draft.renderer.ts`:

```ts
  renderDraftMenuButtons(draftId: string): BotResponse['buttons'] {
    return [
      [{ text: '✅ Опубликовать', data: `draft:save:${draftId}` }],
      [{ text: '🗑 Удалить черновик', data: `draft:discard:${draftId}` }],
    ]
  }

  renderSourceDecisionButtons(draftId: string): BotResponse['buttons'] {
    return [
      [{ text: '➕ Дополнить текущий', data: `draft:merge:${draftId}` }],
      [{ text: '🆕 Новый рецепт', data: `draft:newfrom:${draftId}` }],
    ]
  }

  renderUnknownCallback(): BotResponse {
    return {
      text: 'Не понял действие. Пришли текст, фото или ссылку — я распознаю рецепт.',
    }
  }
```

Keep `renderDraft` and `renderDraftText` as they are.

- [ ] **Step 2: Update draft.handler.interface.ts**

```ts
// src/modules/bot/handlers/draft.handler.interface.ts
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { SetStatus } from '../bot-adapter.interface'

export interface IDraftHandler {
  handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string>
  handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption: string | undefined, setStatus?: SetStatus): Promise<string>
}
```

- [ ] **Step 3: Rewrite draft.handler.ts**

```ts
// src/modules/bot/handlers/draft.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken, DraftRefinementServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IDraftRefinementService } from '@/modules/recipe-drafts/services/draft-refinement.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { IDraftHandler } from './draft.handler.interface'
import type { SetStatus } from '../bot-adapter.interface'

const URL_REGEX = /^https?:\/\/\S+$/

@injectable()
export class DraftHandler implements IDraftHandler {
  constructor(
    @inject(RecipeDraftServiceToken)      private readonly drafts: IRecipeDraftService,
    @inject(DraftRefinementServiceToken)  private readonly refinement: IDraftRefinementService,
    @inject(RecognitionServiceToken)      private readonly recognition: IRecognitionService,
    @inject(DraftRendererToken)           private readonly renderer: DraftRenderer,
  ) {}

  async handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    // ссылка при активном черновике = новый источник → развилка
    if (URL_REGEX.test(text.trim())) {
      return this.stashSourceAndAsk(draft, { kind: 'url', url: text.trim() }, setStatus)
    }
    await setStatus?.('🤖 ИИ дорабатывает черновик...')
    const { draft: updated, summary, answer } = await this.refinement.refine(draft, { text })
    if (answer) return `🤖 ${answer}\n\n${this.renderer.renderDraftText(updated)}`
    return `✅ ${summary}\n\n${this.renderer.renderDraftText(updated)}`
  }

  async handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption: string | undefined, setStatus?: SetStatus): Promise<string> {
    return this.stashSourceAndAsk(draft, { kind: 'photo', buffer, mimeType, caption }, setStatus)
  }

  private async stashSourceAndAsk(
    draft: RecipeDraftEntity,
    input: Parameters<IRecognitionService['toContent']>[0],
    setStatus?: SetStatus,
  ): Promise<string> {
    await setStatus?.('🔍 Извлекаю источник...')
    const content = await this.recognition.toContent(input)
    await this.drafts.updateDraft(draft.id, { pendingSource: content })
    return 'Это к текущему черновику или новый рецепт?'
  }
}
```

(Note: the decision buttons are rendered by the bot/callback layer; `handleText`/`handlePhoto` return text, and the `recipe-bot` attaches `renderSourceDecisionButtons` when the returned text is the decision prompt — see Step 5. To keep the adapter contract simple, `recipe-bot` will detect the pending source and send buttons.)

- [ ] **Step 4: Rewrite callback.handler.ts**

```ts
// src/modules/bot/handlers/callback.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken, DraftRefinementServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IDraftRefinementService } from '@/modules/recipe-drafts/services/draft-refinement.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { BotResponse, BotCallbackContext } from '../bot-adapter.interface'
import type { ICallbackHandler } from './callback.handler.interface'

const WEB_URL = () => process.env.WEB_URL ?? 'http://localhost:3000'

@injectable()
export class CallbackHandler implements ICallbackHandler {
  constructor(
    @inject(RecipeDraftServiceToken)     private readonly drafts: IRecipeDraftService,
    @inject(DraftRefinementServiceToken) private readonly refinement: IDraftRefinementService,
    @inject(RecognitionServiceToken)     private readonly recognition: IRecognitionService,
    @inject(DraftRendererToken)          private readonly renderer: DraftRenderer,
  ) {}

  async handle(data: string, context: BotCallbackContext): Promise<BotResponse> {
    const [scope, action, id] = data.split(':')
    if (scope !== 'draft' || !action || !id) return this.renderer.renderUnknownCallback()

    const draft = await this.drafts.getActiveDraft(context.channel, context.chatId, context.userId)
    if (!draft || draft.id !== id) return this.renderer.renderUnknownCallback()
    const buttons = () => this.renderer.renderDraftMenuButtons(id)

    switch (action) {
      case 'merge': {
        if (!draft.pendingSource) return { text: 'Источник не найден, пришли его снова.', buttons: buttons() }
        const { draft: updated, summary } = await this.recognition.mergeContentIntoDraft(draft, draft.pendingSource)
        await this.drafts.updateDraft(id, { pendingSource: null })
        return { text: `✅ ${summary}\n\n${this.renderer.renderDraftText(updated)}`, buttons: buttons() }
      }

      case 'newfrom': {
        if (!draft.pendingSource) return { text: 'Источник не найден, пришли его снова.', buttons: buttons() }
        const content = draft.pendingSource
        await this.drafts.discardDraft(id)
        const created = await this.recognition.createDraftFromContent(
          content,
          content.sourceUrl ? 'url' : (content.images?.length ? 'photo' : 'text'),
          { channel: context.channel, chatId: context.chatId, userId: context.userId },
        )
        return this.renderer.renderDraft(created)
      }

      case 'save':
        await this.drafts.setConfirming(id)
        return {
          text: 'Опубликовать черновик как рецепт?',
          buttons: [
            [{ text: '✅ Подтвердить', data: `draft:confirm_save:${id}` }],
            [{ text: '← Назад', data: `draft:back:${id}` }],
          ],
        }

      case 'confirm_save':
        try {
          const recipe = await this.drafts.saveDraft(id)
          return { text: `✅ Опубликовано!\nРецепт: ${WEB_URL()}/recipes/${recipe.id}\nРучная правка: ${WEB_URL()}/admin/recipes/${recipe.id}/edit` }
        } catch (error) {
          return { text: `❌ Не удалось опубликовать: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`, buttons: buttons() }
        }

      case 'back':
        await this.drafts.setEditing(id)
        return this.renderer.renderDraft(draft)

      case 'discard':
        await this.drafts.discardDraft(id)
        return { text: '🗑 Черновик удалён. Пришли текст, фото или ссылку, чтобы начать новый.' }

      default:
        return this.renderer.renderUnknownCallback()
    }
  }
}
```

- [ ] **Step 5: Rewrite recipe-bot.ts routing**

```ts
// src/modules/bot/recipe-bot.ts
import { inject } from 'inversify'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftHandlerToken, CallbackHandlerToken, DraftRendererToken } from './bot.tokens'
import type { IBotAdapter } from './bot-adapter.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { IDraftHandler } from './handlers/draft.handler.interface'
import type { ICallbackHandler } from './handlers/callback.handler.interface'
import type { DraftRenderer } from './renderer/draft.renderer'

export class RecipeBot {
  private readonly webUrl = process.env.WEB_URL ?? 'http://localhost:3000'

  constructor(
    private readonly adapter: IBotAdapter,
    @inject(RecipeDraftServiceToken) private readonly draftService: IRecipeDraftService,
    @inject(RecognitionServiceToken) private readonly recognition: IRecognitionService,
    @inject(DraftHandlerToken)       private readonly draftHandler: IDraftHandler,
    @inject(CallbackHandlerToken)    private readonly callbackHandler: ICallbackHandler,
    @inject(DraftRendererToken)      private readonly renderer: DraftRenderer,
  ) {}

  register(): this {
    this.adapter.onStart(() => ({
      text:
        'Привет! Пришли мне рецепт — я распознаю его и соберу черновик:\n\n' +
        '📝 текст рецепта\n🔗 ссылку на сайт или видео (YouTube/Reels/TikTok)\n📷 фото страницы или блюда\n\n' +
        'Дальше можно дорабатывать черновик обычными сообщениями — этим занимается ИИ.\n' +
        `Готовые рецепты: ${this.webUrl}/recipes`,
    }))

    this.adapter.onText(async (text, context, setStatus) => {
      const ctx = this.ctx(context)
      const draft = ctx ? await this.draftService.getActiveDraft(ctx.channel, ctx.chatId, ctx.userId) : null
      if (draft) return this.draftHandler.handleText(draft, text, setStatus)
      if (!ctx) return 'Не удалось определить чат.'
      await setStatus?.('🔍 Распознаю рецепт...')
      const created = await this.recognition.recognize(this.textInput(text), ctx)
      return this.renderer.renderDraftText(created)
    })

    this.adapter.onPhoto(async (buffer, mimeType, caption, context, setStatus) => {
      const ctx = this.ctx(context)
      const draft = ctx ? await this.draftService.getActiveDraft(ctx.channel, ctx.chatId, ctx.userId) : null
      if (draft) return this.draftHandler.handlePhoto(draft, buffer, mimeType, caption, setStatus)
      if (!ctx) return 'Не удалось определить чат.'
      await setStatus?.('🔍 Распознаю рецепт из фото...')
      const created = await this.recognition.recognize({ kind: 'photo', buffer, mimeType, caption }, ctx)
      return this.renderer.renderDraftText(created)
    })

    this.adapter.onCallback(async (data, context) => this.callbackHandler.handle(data, context))

    return this
  }

  start(): void {
    this.adapter.start()
  }

  private ctx(context?: { channel: string; chatId: string; userId: string }) {
    return context ? { channel: context.channel, chatId: context.chatId, userId: context.userId } : null
  }

  private textInput(text: string) {
    const trimmed = text.trim()
    return /^https?:\/\/\S+$/.test(trimmed)
      ? ({ kind: 'url', url: trimmed } as const)
      : ({ kind: 'text', text: trimmed } as const)
  }
}
```

Note: после `draftHandler.handleText`/`handlePhoto`, если в черновике появился `pendingSource`, бот должен показать кнопки развилки. Реализуй так: в обоих `onText`/`onPhoto` ветках с активным черновиком, после получения ответа, перечитай черновик и, если `pendingSource !== null`, верни строку как есть (адаптер шлёт текст). Кнопки развилки доставь отдельным сообщением через callback-меню. **Упрощение для текущего шага:** возвращаем текст «Это к текущему черновику или новый рецепт?», а кнопки `merge`/`newfrom` всегда доступны в меню черновика, добавив их в `renderDraftMenuButtons` при `pendingSource !== null`. Реализуй через перегрузку: `renderer.renderDraft(draft)` уже знает про `pendingSource`. Для этого:

- В `draft.renderer.ts` сделай `renderDraftMenuButtons(draftId, hasPendingSource = false)` — при `hasPendingSource` добавляй сверху `renderSourceDecisionButtons`. Обнови вызовы в `callback.handler` (`buttons()` → `this.renderer.renderDraftMenuButtons(id, !!draft.pendingSource)`), и в `recipe-bot` ветках с активным черновиком возвращай `BotResponse` вместо строки.

> **Уточнение реализации (зафиксировано):** меняем контракт `onText`/`onPhoto`-веток на отправку через тот же путь, что и callback: handler-методы возвращают `string`, а бот после доработки/стэша перечитывает черновик и вызывает `adapter` для текста. Кнопки доставляются при следующем взаимодействии из меню. Это сохраняет существующий `IBotAdapter` (onText/onPhoto возвращают `Promise<string>`), не расширяя его. Кнопки развилки и меню показываются на callback-ответах (которые возвращают `BotResponse`).

- [ ] **Step 6: Update bot.tokens.ts**

Remove `ImportHandlerToken`. Final content:

```ts
// src/modules/bot/bot.tokens.ts
import type { ServiceIdentifier } from 'inversify'
import type { IDraftHandler } from './handlers/draft.handler.interface'
import type { ICallbackHandler } from './handlers/callback.handler.interface'
import type { DraftRenderer } from './renderer/draft.renderer'

export const DraftHandlerToken: ServiceIdentifier<IDraftHandler> = Symbol.for('DraftHandler')
export const CallbackHandlerToken: ServiceIdentifier<ICallbackHandler> = Symbol.for('CallbackHandler')
export const DraftRendererToken: ServiceIdentifier<DraftRenderer> = Symbol.for('DraftRenderer')
```

- [ ] **Step 7: Update DI bindings**

In `src/container.ts` remove the `ImportHandler` import and its binding (`container.bind(ImportHandlerToken)...`). Keep `DraftRenderer`, `CallbackHandler`, `DraftHandler` bindings.

- [ ] **Step 8: Update scripts/bot.ts**

```ts
// scripts/bot.ts
import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftHandlerToken, CallbackHandlerToken, DraftRendererToken } from '@/modules/bot/bot.tokens'
import { createBotAdapters } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapters = createBotAdapters()
for (const adapter of adapters) {
  new RecipeBot(
    adapter,
    container.get(RecipeDraftServiceToken),
    container.get(RecognitionServiceToken),
    container.get(DraftHandlerToken),
    container.get(CallbackHandlerToken),
    container.get(DraftRendererToken),
  ).register().start()
}
```

- [ ] **Step 9: Rewrite handler + renderer tests**

Rewrite `tests/unit/bot/handlers/draft.handler.test.ts` to cover: text → `refinement.refine` called and summary rendered; URL/photo → `recognition.toContent` called and `updateDraft({ pendingSource })` set. Rewrite `tests/unit/bot/handlers/callback.handler.test.ts` to cover: `merge` → `mergeContentIntoDraft` + clears pendingSource; `newfrom` → discard + `createDraftFromContent`; `save`→`setConfirming`; `confirm_save`→`saveDraft` returns links; `discard`→`discardDraft`. Update `tests/unit/bot/renderer/draft.renderer.test.ts` to expect new buttons (`save`, `discard`, and decision buttons). Use the existing tests' mocking style (`vi.fn()` per interface method).

```ts
// tests/unit/bot/handlers/draft.handler.test.ts (example shape)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftHandler } from '@/modules/bot/handlers/draft.handler'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const draft = { id: 'd1', steps: [], ingredients: [], title: null, coverImageKey: null, videoUrl: null } as unknown as RecipeDraftEntity

const drafts = { updateDraft: vi.fn().mockResolvedValue(draft) } as any
const refinement = { refine: vi.fn().mockResolvedValue({ draft, summary: 'обновил название' }) } as any
const recognition = { toContent: vi.fn().mockResolvedValue({ text: 'x' }) } as any

describe('DraftHandler', () => {
  beforeEach(() => vi.clearAllMocks())
  const h = () => new DraftHandler(drafts, refinement, recognition, new DraftRenderer())

  it('plain text → refine', async () => {
    const out = await h().handleText(draft, 'назови Борщ')
    expect(refinement.refine).toHaveBeenCalled()
    expect(out).toContain('обновил название')
  })

  it('url → stashes pendingSource and asks', async () => {
    const out = await h().handleText(draft, 'https://eda.ru/1')
    expect(recognition.toContent).toHaveBeenCalledWith({ kind: 'url', url: 'https://eda.ru/1' })
    expect(drafts.updateDraft).toHaveBeenCalledWith('d1', { pendingSource: { text: 'x' } })
    expect(out).toContain('текущему черновику')
  })

  it('photo → stashes pendingSource', async () => {
    await h().handlePhoto(draft, Buffer.from('a'), 'image/png', undefined)
    expect(recognition.toContent).toHaveBeenCalled()
    expect(drafts.updateDraft).toHaveBeenCalledWith('d1', expect.objectContaining({ pendingSource: expect.anything() }))
  })
})
```

- [ ] **Step 10: Run full suite + typecheck**

Run: `pnpm test:run`
Then run a build/typecheck: `pnpm exec tsc --noEmit`
Expected: PASS. Fix any type errors caused by the still-present old `import.handler.ts` / `recipe-assistant` (they remain until Task 8; if they break compile because of removed `ImportHandlerToken`, that confirms they must be removed in Task 8 — but `import.handler.ts` doesn't reference `ImportHandlerToken`, only `container.ts` did, which we updated). The old `recipe-assistant` test still references the existing assistant — leave it until Task 8.

- [ ] **Step 11: Commit**

```bash
git add src/modules/bot scripts/bot.ts src/container.ts tests/unit/bot
git commit -m "feat(bot): recognition-first flow with AI refinement and publish"
```

---

## Task 8: Очистка — удалить старый ассистент, импорт-флоу, pendingAction

**Files:**
- Delete: `src/modules/recipe-drafts/services/recipe-assistant.service.ts`, `.../recipe-assistant.service.interface.ts`
- Delete: `src/modules/bot/handlers/import.handler.ts`, `.../import.handler.interface.ts`
- Delete: `tests/unit/modules/recipe-drafts/recipe-assistant.service.test.ts`, `tests/unit/bot/handlers/import.handler.test.ts`
- Modify: `src/tokens/recipe-draft.tokens.ts` (remove `RecipeAssistantServiceToken`)
- Modify: `src/container.ts` (remove assistant binding/import)
- Modify: `src/modules/import-jobs/services/import-job.service.ts` + interface (remove `importFrom*` methods OR delete service if unused)
- Modify: `src/modules/recipes/db/recipe.schema.ts` (drop `pending_action`)
- Modify: `src/modules/recipe-drafts/entities/recipe-draft.entity.ts` (remove `pendingAction` + `DraftPendingAction`)
- Modify: `src/modules/recipe-drafts/repositories/recipe-draft.repository.ts` (remove pendingAction mapping)

- [ ] **Step 1: Delete old assistant + import handler files and their tests**

```bash
git rm src/modules/recipe-drafts/services/recipe-assistant.service.ts \
       src/modules/recipe-drafts/services/recipe-assistant.service.interface.ts \
       src/modules/bot/handlers/import.handler.ts \
       src/modules/bot/handlers/import.handler.interface.ts \
       tests/unit/modules/recipe-drafts/recipe-assistant.service.test.ts \
       tests/unit/bot/handlers/import.handler.test.ts
```

- [ ] **Step 2: Remove RecipeAssistantServiceToken**

In `src/tokens/recipe-draft.tokens.ts` remove the `RecipeAssistantServiceToken` declaration and its `IRecipeAssistantService` import.

- [ ] **Step 3: Clean container.ts**

Remove the `RecipeAssistantService` import, the `RecipeAssistantServiceToken` import, and the `container.bind(RecipeAssistantServiceToken)...` line.

- [ ] **Step 4: Decide ImportJobService**

`RecognitionService` now uses `ImportJobRepository` directly for logging, so `ImportJobService.importFrom*` are dead. Remove the unused methods from `import-job.service.ts` and its interface. If nothing else consumes `ImportJobService` (check: `grep -rn ImportJobServiceToken src scripts`), also remove its token binding from `container.ts`, the `ImportJobServiceToken` from `src/tokens/import-job.tokens.ts`, the service + interface files, and `tests/unit/import-jobs/import-job.service.test.ts`. Keep `ImportJobRepository` (used by RecognitionService) and `RecipeParser`? `RecipeParser` is now unused (extractor replaces it) — remove `recipe-parser.service.ts`, `recipe-parser.interface.ts`, `RecipeParserToken`, its binding, and `tests/unit/import-jobs/recipe-parser.schema.test.ts`. Verify with grep before each removal.

```bash
grep -rn "ImportJobServiceToken\|RecipeParserToken\|RecipeParser\b" src scripts tests
```

Remove only what has no remaining references outside the files being deleted.

- [ ] **Step 5: Remove pendingAction from entity**

In `src/modules/recipe-drafts/entities/recipe-draft.entity.ts` delete the `DraftPendingAction` type and the `pendingAction` field.

- [ ] **Step 6: Remove pendingAction from repository**

In `src/modules/recipe-drafts/repositories/recipe-draft.repository.ts` remove the `pendingAction` mapping in `mapToEntity` and the `if (patch.pendingAction !== undefined)...` line in `update`, and the `DraftPendingAction` import.

- [ ] **Step 7: Drop pending_action column**

In `src/modules/recipes/db/recipe.schema.ts` remove the `pendingAction: text('pending_action'),` line from `recipeDrafts`. Then:

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: migration dropping `pending_action`, applied cleanly.

- [ ] **Step 8: Run full suite + typecheck**

Run: `pnpm test:run && pnpm exec tsc --noEmit`
Expected: PASS, no references to removed symbols.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy assistant, import flow and pendingAction"
```

---

## Task 9: Ручная проверка бота (smoke)

**Files:** none (manual verification).

- [ ] **Step 1: Prereqs**

Ensure `.env` has `OPENROUTER_BASE_URL`, `OPENROUTER_API_KEY`, `RECOGNITION_MODEL`, `REFINEMENT_MODEL`, `BOT_PROVIDERS`/Telegram token, `WEB_URL`, `DATABASE_URL`, MinIO vars. Run `docker compose up -d` and `pnpm db:migrate`.

- [ ] **Step 2: Start the bot**

Run: `pnpm bot`
Expected: starts without DI errors.

- [ ] **Step 3: Manual checks in Telegram**

- Send recipe text → draft created and rendered, buttons `[Опубликовать] [Удалить]`.
- Send `https://youtu.be/...` (no active draft) → draft from video description.
- Send a follow-up text edit ("назови Паста Карбонара") → AI updates title, summary shown.
- With active draft, send a photo → "Это к текущему черновику или новый рецепт?"; verify merge/new via menu buttons.
- Press `Опубликовать` → `Подтвердить` → links to `/recipes/:id` and `/admin/recipes/:id/edit`.
- In admin, edit the published recipe manually.

- [ ] **Step 4: Commit (if any config/docs tweaks were needed)**

```bash
git add -A
git commit -m "chore: bot recognition smoke verification tweaks"
```

---

## Notes / Deviations from spec

- **`url-scraper` not deleted:** kept as the shared scraping primitive consumed by `UrlSource` and `VideoSource` (DRY) instead of duplicating Puppeteer logic. Spec said "absorbed/deleted"; reuse via DI is the better engineering choice.
- **Adapter contract unchanged:** `onText`/`onPhoto` still return `Promise<string>`. The merge/new decision buttons are surfaced via the callback menu (`renderDraftMenuButtons(id, hasPendingSource)`), avoiding an `IBotAdapter` change.
- **Video subtitles:** simple path only — page description/caption via `CheerioScraper`. No yt-dlp/Whisper/frame analysis (explicitly out of scope per spec).
