# cook-book Plan 2: Telegram Bot + DeepSeek Recipe Parser

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram бот на grammY, который принимает текст рецепта или фото блюда, парсит через DeepSeek API и создаёт запись в базе данных через существующий RecipeService.

**Architecture:** Бот запускается как отдельный процесс (`pnpm bot`, long polling, публичный IP не нужен). `ImportJobService` оркестрирует поток: создание job в БД → парсинг через `IRecipeParser` (DeepSeek реализация) → создание рецепта через `IRecipeService` → обновление статуса job. Все зависимости разрешаются через существующий Inversify контейнер (`src/container.ts`).

**Tech Stack:** grammY (Telegram bot), openai SDK (DeepSeek OpenAI-compatible API), Zod (валидация LLM-ответа), Inversify (DI), Drizzle ORM (таблица `import_jobs` уже в схеме), Vitest

---

## Принцип

Таблица `import_jobs` уже существует в `src/modules/recipes/db/recipe.schema.ts`. Миграции не нужны.
Для фото бот скачивает файл с серверов Telegram, конвертирует в base64 и передаёт в DeepSeek. Если модель не поддерживает vision — бот отвечает пользователю с просьбой описать рецепт текстом.

Все `@injectable()` классы получают зависимости через `@inject()`. Классы без DI-зависимостей (Repository, Parser) помечаются `@injectable()` но имеют пустой конструктор.

---

## Карта файлов

```
src/
├── modules/
│   ├── recipes/
│   │   └── db/recipe.schema.ts          # modify: добавить ImportJobRow type
│   └── import-jobs/                     # новый модуль
│       ├── entities/
│       │   └── import-job.entity.ts     # ImportJobEntity, ImportStatus, SourceType
│       ├── repositories/
│       │   ├── import-job.repository.interface.ts
│       │   └── import-job.repository.ts # Drizzle реализация
│       └── services/
│           ├── recipe-parser.interface.ts   # IRecipeParser, ParsedRecipe
│           ├── import-job.service.interface.ts
│           └── import-job.service.ts    # оркестрирует поток
├── lib/
│   └── deepseek.ts                      # DeepSeekRecipeParser + ParsedRecipeSchema + extractJson
└── tokens/
    ├── recipe.tokens.ts                 (существующий, не трогаем)
    └── import-job.tokens.ts             # ImportJobRepositoryToken, RecipeParserToken, ImportJobServiceToken

scripts/
└── bot.ts                               # grammY long polling entry point

tests/unit/import-jobs/
├── recipe-parser.schema.test.ts         # тесты ParsedRecipeSchema и extractJson
└── import-job.service.test.ts           # TDD тесты сервиса
```

**Модифицируемые файлы:**
- `src/modules/recipes/db/recipe.schema.ts` — добавить `ImportJobRow`
- `src/container.ts` — зарегистрировать новые биндинги
- `.env.example` — добавить `TELEGRAM_BOT_TOKEN`, `DEEPSEEK_API_KEY`, `WEB_URL`
- `package.json` — добавить скрипт `bot`

---

## Task 1: Зависимости и переменные окружения

**Files:**
- Modify: `package.json` (через pnpm add)
- Modify: `.env.example`
- Modify: `.env`

- [ ] **Step 1.1: Установи новые зависимости**

```bash
pnpm add grammy openai
```

Ожидаемый вывод: обе зависимости добавлены в `package.json` в секцию `dependencies`.

- [ ] **Step 1.2: Добавь env vars в `.env.example`**

Открой `.env.example` и добавь в конец:

```bash
# Telegram bot (получить у @BotFather)
TELEGRAM_BOT_TOKEN=

# DeepSeek API (https://platform.deepseek.com)
DEEPSEEK_API_KEY=

# URL веб-приложения (для ссылок в ответах бота)
WEB_URL=http://localhost:3000
```

- [ ] **Step 1.3: Добавь те же vars в `.env`**

Открой `.env` и добавь в конец (подставь реальные значения):

```bash
TELEGRAM_BOT_TOKEN=<твой_токен_от_BotFather>
DEEPSEEK_API_KEY=<твой_ключ_с_platform.deepseek.com>
WEB_URL=http://localhost:3000
```

Как получить `TELEGRAM_BOT_TOKEN`: открой Telegram → напиши [@BotFather](https://t.me/BotFather) → `/newbot` → получи токен.

Как получить `DEEPSEEK_API_KEY`: зарегистрируйся на `platform.deepseek.com` → API Keys → Create API Key.

- [ ] **Step 1.4: Добавь скрипт `bot` в `package.json`**

Открой `package.json` и добавь в секцию `"scripts"`:

```json
"bot": "tsx scripts/bot.ts"
```

- [ ] **Step 1.5: Закоммить**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "feat: add grammy and openai dependencies for Plan 2"
```

---

## Task 2: ImportJob модуль — Entity, Repository, интерфейсы, токены

**Files:**
- Modify: `src/modules/recipes/db/recipe.schema.ts`
- Create: `src/modules/import-jobs/entities/import-job.entity.ts`
- Create: `src/modules/import-jobs/repositories/import-job.repository.interface.ts`
- Create: `src/modules/import-jobs/repositories/import-job.repository.ts`
- Create: `src/modules/import-jobs/services/recipe-parser.interface.ts`
- Create: `src/modules/import-jobs/services/import-job.service.interface.ts`
- Create: `src/tokens/import-job.tokens.ts`

- [ ] **Step 2.1: Добавь тип `ImportJobRow` в схему**

Открой `src/modules/recipes/db/recipe.schema.ts` и добавь после строки `export type NewRecipeRow`:

```typescript
export type ImportJobRow = typeof importJobs.$inferSelect
```

- [ ] **Step 2.2: Создай `src/modules/import-jobs/entities/import-job.entity.ts`**

```typescript
export type ImportStatus = 'pending' | 'processing' | 'done' | 'failed'
export type SourceType = 'photo' | 'text' | 'url'

export interface ImportJobEntity {
  id: string
  status: ImportStatus
  sourceType: SourceType
  rawInput: string
  recipeId: string | null
  error: string | null
  createdAt: Date
}
```

- [ ] **Step 2.3: Создай `src/modules/import-jobs/repositories/import-job.repository.interface.ts`**

```typescript
import type { ImportJobEntity, ImportStatus, SourceType } from '../entities/import-job.entity'

export interface IImportJobRepository {
  create(data: { sourceType: SourceType; rawInput: string }): Promise<ImportJobEntity>
  findById(id: string): Promise<ImportJobEntity | null>
  updateStatus(
    id: string,
    status: ImportStatus,
    opts?: { recipeId?: string; error?: string }
  ): Promise<void>
}
```

- [ ] **Step 2.4: Создай `src/modules/import-jobs/repositories/import-job.repository.ts`**

```typescript
import 'reflect-metadata'
import { injectable } from 'inversify'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { importJobs } from '@/modules/recipes/db/recipe.schema'
import type { ImportJobRow } from '@/modules/recipes/db/recipe.schema'
import type { IImportJobRepository } from './import-job.repository.interface'
import type { ImportJobEntity, ImportStatus, SourceType } from '../entities/import-job.entity'

@injectable()
export class ImportJobRepository implements IImportJobRepository {
  private mapToEntity(row: ImportJobRow): ImportJobEntity {
    return {
      id: row.id,
      status: row.status as ImportStatus,
      sourceType: row.sourceType as SourceType,
      rawInput: row.rawInput,
      recipeId: row.recipeId ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
    }
  }

  async create(data: { sourceType: SourceType; rawInput: string }): Promise<ImportJobEntity> {
    const rows = await db
      .insert(importJobs)
      .values({ sourceType: data.sourceType, rawInput: data.rawInput })
      .returning()
    return this.mapToEntity(rows[0])
  }

  async findById(id: string): Promise<ImportJobEntity | null> {
    const rows = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1)
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async updateStatus(
    id: string,
    status: ImportStatus,
    opts?: { recipeId?: string; error?: string }
  ): Promise<void> {
    await db
      .update(importJobs)
      .set({
        status,
        ...(opts?.recipeId !== undefined ? { recipeId: opts.recipeId } : {}),
        ...(opts?.error !== undefined ? { error: opts.error } : {}),
      })
      .where(eq(importJobs.id, id))
  }
}
```

- [ ] **Step 2.5: Создай `src/modules/import-jobs/services/recipe-parser.interface.ts`**

```typescript
export interface ParsedRecipe {
  title: string
  ingredients: Array<{ name: string; amount: string; unit: string }>
  steps: Array<{ order: number; text: string }>
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
}

export interface IRecipeParser {
  parseText(text: string): Promise<ParsedRecipe>
  parsePhoto(base64: string, mimeType: string): Promise<ParsedRecipe>
}
```

- [ ] **Step 2.6: Создай `src/modules/import-jobs/services/import-job.service.interface.ts`**

```typescript
import type { ImportJobEntity } from '../entities/import-job.entity'

export interface IImportJobService {
  importFromText(text: string): Promise<ImportJobEntity>
  importFromPhoto(photoBuffer: Buffer, mimeType: string): Promise<ImportJobEntity>
}
```

- [ ] **Step 2.7: Создай `src/tokens/import-job.tokens.ts`**

```typescript
import type { ServiceIdentifier } from 'inversify'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { IRecipeParser } from '@/modules/import-jobs/services/recipe-parser.interface'

export const ImportJobRepositoryToken: ServiceIdentifier<IImportJobRepository> = Symbol.for('ImportJobRepository')
export const ImportJobServiceToken: ServiceIdentifier<IImportJobService> = Symbol.for('ImportJobService')
export const RecipeParserToken: ServiceIdentifier<IRecipeParser> = Symbol.for('RecipeParser')
```

- [ ] **Step 2.8: Закоммить**

```bash
git add src/modules/recipes/db/recipe.schema.ts \
        src/modules/import-jobs/ \
        src/tokens/import-job.tokens.ts
git commit -m "feat: add ImportJob module — entity, repository, interfaces, tokens"
```

---

## Task 3: IRecipeParser — DeepSeek реализация (TDD)

**Files:**
- Create: `tests/unit/import-jobs/recipe-parser.schema.test.ts`
- Create: `src/lib/deepseek.ts`

- [ ] **Step 3.1: Напиши failing тест**

Создай `tests/unit/import-jobs/recipe-parser.schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ParsedRecipeSchema, extractJson } from '@/lib/deepseek'

describe('ParsedRecipeSchema', () => {
  it('validates a correctly structured recipe from LLM', () => {
    const input = {
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу кубиками' }],
      cookTimeMinutes: 90,
      servings: 4,
      tags: ['суп', 'украинская кухня'],
    }
    const result = ParsedRecipeSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('defaults missing cookTimeMinutes, servings, tags to null / []', () => {
    const input = {
      title: 'Яичница',
      ingredients: [{ name: 'Яйцо', amount: '2', unit: 'шт' }],
      steps: [{ order: 1, text: 'Разбить яйца на сковороду' }],
    }
    const result = ParsedRecipeSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cookTimeMinutes).toBeNull()
      expect(result.data.servings).toBeNull()
      expect(result.data.tags).toEqual([])
    }
  })

  it('rejects recipe with empty title', () => {
    const input = {
      title: '',
      ingredients: [{ name: 'Яйцо', amount: '2', unit: 'шт' }],
      steps: [{ order: 1, text: 'Разбить яйца' }],
    }
    expect(ParsedRecipeSchema.safeParse(input).success).toBe(false)
  })
})

describe('extractJson', () => {
  it('parses plain JSON string', () => {
    const result = extractJson('{"title":"Борщ"}')
    expect(result).toEqual({ title: 'Борщ' })
  })

  it('extracts JSON from markdown code block with json tag', () => {
    const text = '```json\n{"title":"Борщ"}\n```'
    expect(extractJson(text)).toEqual({ title: 'Борщ' })
  })

  it('extracts JSON from code block without language tag', () => {
    const text = '```\n{"title":"Борщ"}\n```'
    expect(extractJson(text)).toEqual({ title: 'Борщ' })
  })
})
```

- [ ] **Step 3.2: Запусти тест — должен упасть**

```bash
pnpm test:run tests/unit/import-jobs/recipe-parser.schema.test.ts
```

Ожидаемый вывод: FAIL — `Cannot find module '@/lib/deepseek'`

- [ ] **Step 3.3: Реализуй `src/lib/deepseek.ts`**

```typescript
import 'reflect-metadata'
import { injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import type { IRecipeParser, ParsedRecipe } from '@/modules/import-jobs/services/recipe-parser.interface'

export const ParsedRecipeSchema = z.object({
  title: z.string().min(1),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      amount: z.string().min(1),
      unit: z.string(),
    })
  ).min(1),
  steps: z.array(
    z.object({
      order: z.number().int().positive(),
      text: z.string().min(1),
    })
  ).min(1),
  cookTimeMinutes: z.number().int().positive().nullable().default(null),
  servings: z.number().int().positive().nullable().default(null),
  tags: z.array(z.string()).default([]),
})

export function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/s)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Extract recipe information from the user's input and respond with a JSON object only, no markdown. The JSON must follow this exact structure:
{
  "title": "Recipe name",
  "ingredients": [{"name": "ingredient name", "amount": "100", "unit": "г"}],
  "steps": [{"order": 1, "text": "Step description"}],
  "cookTimeMinutes": 30,
  "servings": 4,
  "tags": ["tag1", "tag2"]
}
Rules:
- Use null for cookTimeMinutes and servings if unknown.
- Tags must be short keywords in the same language as the recipe text.
- steps[].order must start at 1 and increment by 1.
- Respond with valid JSON only. No markdown, no explanations.`

@injectable()
export class DeepSeekRecipeParser implements IRecipeParser {
  private readonly client: OpenAI

  constructor() {
    this.client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    })
  }

  async parseText(text: string): Promise<ParsedRecipe> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('DeepSeek returned empty response')

    const raw = extractJson(content)
    return ParsedRecipeSchema.parse(raw)
  }

  async parsePhoto(base64: string, mimeType: string): Promise<ParsedRecipe> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url' as const,
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            {
              type: 'text' as const,
              text: 'Extract the recipe from this image.',
            },
          ],
        },
      ],
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('DeepSeek returned empty response')

    const raw = extractJson(content)
    return ParsedRecipeSchema.parse(raw)
  }
}
```

- [ ] **Step 3.4: Запусти тест — должен пройти**

```bash
pnpm test:run tests/unit/import-jobs/recipe-parser.schema.test.ts
```

Ожидаемый вывод: `6 passed`

- [ ] **Step 3.5: Закоммить**

```bash
git add src/lib/deepseek.ts tests/unit/import-jobs/recipe-parser.schema.test.ts
git commit -m "feat: add DeepSeekRecipeParser with ParsedRecipeSchema and extractJson"
```

---

## Task 4: ImportJobService (TDD)

**Files:**
- Create: `tests/unit/import-jobs/import-job.service.test.ts`
- Create: `src/modules/import-jobs/services/import-job.service.ts`

- [ ] **Step 4.1: Напиши failing тесты**

Создай `tests/unit/import-jobs/import-job.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportJobService } from '@/modules/import-jobs/services/import-job.service'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { IRecipeParser } from '@/modules/import-jobs/services/recipe-parser.interface'
import type { ImportJobEntity } from '@/modules/import-jobs/entities/import-job.entity'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'

const pendingJob: ImportJobEntity = {
  id: 'job-1',
  status: 'pending',
  sourceType: 'text',
  rawInput: 'Рецепт борща',
  recipeId: null,
  error: null,
  createdAt: new Date('2026-01-01'),
}

const mockRecipe: RecipeEntity = {
  id: 'recipe-1',
  title: 'Борщ',
  ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
  steps: [{ order: 1, text: 'Нарезать свёклу' }],
  cookTimeMinutes: 90,
  servings: 4,
  tags: ['суп'],
  sourceUrl: null,
  imageKey: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const parsedRecipe = {
  title: 'Борщ',
  ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
  steps: [{ order: 1, text: 'Нарезать свёклу' }],
  cookTimeMinutes: 90 as number | null,
  servings: 4 as number | null,
  tags: ['суп'],
}

const mockRepo: IImportJobRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
}

const mockParser: IRecipeParser = {
  parseText: vi.fn(),
  parsePhoto: vi.fn(),
}

const mockRecipeService: IRecipeService = {
  getAll: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

describe('ImportJobService', () => {
  let service: ImportJobService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ImportJobService(mockRepo, mockParser, mockRecipeService)
  })

  it('importFromText: creates job, parses text, creates recipe, updates to done', async () => {
    vi.mocked(mockRepo.create).mockResolvedValue(pendingJob)
    vi.mocked(mockParser.parseText).mockResolvedValue(parsedRecipe)
    vi.mocked(mockRecipeService.create).mockResolvedValue(mockRecipe)
    vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)

    const result = await service.importFromText('Рецепт борща')

    expect(mockRepo.create).toHaveBeenCalledWith({ sourceType: 'text', rawInput: 'Рецепт борща' })
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'processing')
    expect(mockParser.parseText).toHaveBeenCalledWith('Рецепт борща')
    expect(mockRecipeService.create).toHaveBeenCalledWith({ ...parsedRecipe, sourceUrl: null })
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'done', { recipeId: 'recipe-1' })
    expect(result.status).toBe('done')
    expect(result.recipeId).toBe('recipe-1')
  })

  it('importFromText: updates job to failed when parser throws', async () => {
    vi.mocked(mockRepo.create).mockResolvedValue(pendingJob)
    vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)
    vi.mocked(mockParser.parseText).mockRejectedValue(new Error('DeepSeek timeout'))

    const result = await service.importFromText('Рецепт борща')

    expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'failed', {
      error: 'DeepSeek timeout',
    })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('DeepSeek timeout')
  })

  it('importFromPhoto: converts buffer to base64, stores as rawInput, calls parsePhoto', async () => {
    const photoJob: ImportJobEntity = { ...pendingJob, sourceType: 'photo' }
    vi.mocked(mockRepo.create).mockResolvedValue(photoJob)
    vi.mocked(mockParser.parsePhoto).mockResolvedValue(parsedRecipe)
    vi.mocked(mockRecipeService.create).mockResolvedValue(mockRecipe)
    vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)

    const buffer = Buffer.from('fake-image-data')
    const result = await service.importFromPhoto(buffer, 'image/jpeg')

    const expectedBase64 = buffer.toString('base64')
    expect(mockRepo.create).toHaveBeenCalledWith({ sourceType: 'photo', rawInput: expectedBase64 })
    expect(mockParser.parsePhoto).toHaveBeenCalledWith(expectedBase64, 'image/jpeg')
    expect(result.status).toBe('done')
    expect(result.recipeId).toBe('recipe-1')
  })
})
```

- [ ] **Step 4.2: Запусти тест — должен упасть**

```bash
pnpm test:run tests/unit/import-jobs/import-job.service.test.ts
```

Ожидаемый вывод: FAIL — `Cannot find module '@/modules/import-jobs/services/import-job.service'`

- [ ] **Step 4.3: Реализуй `src/modules/import-jobs/services/import-job.service.ts`**

```typescript
import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import { ImportJobRepositoryToken, RecipeParserToken } from '@/tokens/import-job.tokens'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import type { IImportJobRepository } from '../repositories/import-job.repository.interface'
import type { IRecipeParser } from './recipe-parser.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { IImportJobService } from './import-job.service.interface'
import type { ImportJobEntity } from '../entities/import-job.entity'

@injectable()
export class ImportJobService implements IImportJobService {
  constructor(
    @inject(ImportJobRepositoryToken) private readonly repo: IImportJobRepository,
    @inject(RecipeParserToken) private readonly parser: IRecipeParser,
    @inject(RecipeServiceToken) private readonly recipeService: IRecipeService,
  ) {}

  async importFromText(text: string): Promise<ImportJobEntity> {
    const job = await this.repo.create({ sourceType: 'text', rawInput: text })
    try {
      await this.repo.updateStatus(job.id, 'processing')
      const parsed = await this.parser.parseText(text)
      const recipe = await this.recipeService.create({ ...parsed, sourceUrl: null })
      await this.repo.updateStatus(job.id, 'done', { recipeId: recipe.id })
      return { ...job, status: 'done', recipeId: recipe.id }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      await this.repo.updateStatus(job.id, 'failed', { error })
      return { ...job, status: 'failed', error }
    }
  }

  async importFromPhoto(photoBuffer: Buffer, mimeType: string): Promise<ImportJobEntity> {
    const base64 = photoBuffer.toString('base64')
    const job = await this.repo.create({ sourceType: 'photo', rawInput: base64 })
    try {
      await this.repo.updateStatus(job.id, 'processing')
      const parsed = await this.parser.parsePhoto(base64, mimeType)
      const recipe = await this.recipeService.create({ ...parsed, sourceUrl: null })
      await this.repo.updateStatus(job.id, 'done', { recipeId: recipe.id })
      return { ...job, status: 'done', recipeId: recipe.id }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      await this.repo.updateStatus(job.id, 'failed', { error })
      return { ...job, status: 'failed', error }
    }
  }
}
```

- [ ] **Step 4.4: Запусти тесты — должны пройти**

```bash
pnpm test:run tests/unit/import-jobs/
```

Ожидаемый вывод: `3 passed`

- [ ] **Step 4.5: Запусти все тесты**

```bash
pnpm test:run
```

Ожидаемый вывод: `16 passed` (3 dto + 4 service + 6 parser-schema + 3 import-job-service)

- [ ] **Step 4.6: Закоммить**

```bash
git add src/modules/import-jobs/services/import-job.service.ts \
        tests/unit/import-jobs/import-job.service.test.ts
git commit -m "feat: add ImportJobService with TDD — text and photo import flow"
```

---

## Task 5: Обновить Inversify контейнер

**Files:**
- Modify: `src/container.ts`

- [ ] **Step 5.1: Обнови `src/container.ts`**

Замени содержимое файла на:

```typescript
import 'reflect-metadata'
import { Container } from 'inversify'
import { RecipeRepositoryToken, RecipeServiceToken } from '@/tokens/recipe.tokens'
import { ImportJobRepositoryToken, ImportJobServiceToken, RecipeParserToken } from '@/tokens/import-job.tokens'
import { RecipeRepository } from '@/modules/recipes/repositories/recipe.repository'
import { RecipeService } from '@/modules/recipes/services/recipe.service'
import { ImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository'
import { ImportJobService } from '@/modules/import-jobs/services/import-job.service'
import { DeepSeekRecipeParser } from '@/lib/deepseek'

export const container = new Container()

container.bind(RecipeRepositoryToken).to(RecipeRepository).inSingletonScope()
container.bind(RecipeServiceToken).to(RecipeService).inSingletonScope()
container.bind(ImportJobRepositoryToken).to(ImportJobRepository).inSingletonScope()
container.bind(RecipeParserToken).to(DeepSeekRecipeParser).inSingletonScope()
container.bind(ImportJobServiceToken).to(ImportJobService).inSingletonScope()
```

- [ ] **Step 5.2: Проверь что тесты всё ещё проходят**

```bash
pnpm test:run
```

Ожидаемый вывод: `16 passed`

- [ ] **Step 5.3: Закоммить**

```bash
git add src/container.ts
git commit -m "feat: register ImportJob bindings in Inversify container"
```

---

## Task 6: Telegram Bot

**Files:**
- Create: `scripts/bot.ts`

- [ ] **Step 6.1: Создай `scripts/bot.ts`**

```typescript
import 'dotenv/config'
import 'reflect-metadata'
import { Bot } from 'grammy'
import { container } from '@/container'
import { ImportJobServiceToken } from '@/tokens/import-job.tokens'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set in .env')

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000'

const bot = new Bot(token)
const service = container.get(ImportJobServiceToken)

bot.command('start', ctx =>
  ctx.reply(
    'Привет! Я сохраняю рецепты в твою книгу.\n\n' +
    '📝 Пришли текст рецепта — я распознаю его и сохраню.\n' +
    '📷 Пришли фото блюда — попробую распознать рецепт из фото.\n\n' +
    `Смотреть рецепты: ${WEB_URL}`
  )
)

bot.on('message:text', async ctx => {
  await ctx.reply('⏳ Обрабатываю...')
  try {
    const result = await service.importFromText(ctx.message.text)
    if (result.status === 'done' && result.recipeId) {
      await ctx.reply(`✅ Рецепт сохранён!\n${WEB_URL}/recipes/${result.recipeId}`)
    } else {
      await ctx.reply(
        `❌ Не удалось распознать рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
        'Попробуй переформулировать или добавить больше деталей.'
      )
    }
  } catch (err) {
    await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
    console.error('Error in message:text handler:', err)
  }
})

bot.on('message:photo', async ctx => {
  await ctx.reply('⏳ Скачиваю фото и обрабатываю...')
  try {
    // ctx.message.photo — массив размеров, берём наибольший (последний элемент)
    const photo = ctx.message.photo.at(-1)!
    const file = await ctx.api.getFile(photo.file_id)
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`

    const response = await fetch(fileUrl)
    if (!response.ok) throw new Error(`Failed to download photo: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    const result = await service.importFromPhoto(buffer, 'image/jpeg')
    if (result.status === 'done' && result.recipeId) {
      await ctx.reply(`✅ Рецепт сохранён!\n${WEB_URL}/recipes/${result.recipeId}`)
    } else {
      await ctx.reply(
        `❌ Не удалось распознать рецепт из фото: ${result.error ?? 'неизвестная ошибка'}\n\n` +
        'Попробуй описать рецепт текстом.'
      )
    }
  } catch (err) {
    await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
    console.error('Error in message:photo handler:', err)
  }
})

bot.catch(err => console.error('Unhandled bot error:', err))

bot.start({ onStart: () => console.log(`Bot started (long polling). Web: ${WEB_URL}`) })
```

- [ ] **Step 6.2: Проверь что скрипт запускается без ошибок**

Убедись что `.env` содержит `TELEGRAM_BOT_TOKEN` и `DEEPSEEK_API_KEY`, затем:

```bash
pnpm bot
```

Ожидаемый вывод:
```
Bot started (long polling). Web: http://localhost:3000
```

Бот должен запуститься без ошибок и ждать сообщений.

Если ошибка `TELEGRAM_BOT_TOKEN is not set` — проверь `.env`.
Если ошибка `401 Unauthorized` от Telegram — неверный токен, получи новый у @BotFather.

- [ ] **Step 6.3: End-to-end тест — текстовый рецепт**

1. Убедись, что запущены `docker compose up -d` и `pnpm bot`.
2. Открой бота в Telegram.
3. Отправь `/start` — ожидаемый ответ: приветственное сообщение.
4. Отправь текст:
   ```
   Яичница глазунья:
   2 яйца, соль, масло сливочное.
   1. Разогрей сковороду с маслом.
   2. Разбей яйца, не перемешивая.
   3. Жарь 3 минуты на среднем огне.
   ```
5. Ожидаемый ответ: `✅ Рецепт сохранён! http://localhost:3000/recipes/<id>`
6. Открой ссылку в браузере — рецепт должен отображаться.

- [ ] **Step 6.4: End-to-end тест — фото**

1. Сфотографируй любое блюдо или сохрани фото из интернета.
2. Отправь фото боту.
3. Ожидаемый ответ: успешное сохранение или ошибка с предложением описать текстом.

Если DeepSeek не поддерживает vision (ошибка о неподдерживаемом типе контента) — это ожидаемо. Бот ответит сообщением `❌ Не удалось распознать рецепт из фото`.

- [ ] **Step 6.5: Закоммить**

```bash
git add scripts/bot.ts .env.example package.json
git commit -m "feat: add Telegram bot with grammY long polling"
```

---

## Итог Plan 2

После выполнения всех задач:

| Что работает | Как проверить |
|---|---|
| Telegram бот (long polling) | `pnpm bot` → отправь сообщение боту |
| Парсинг текста через DeepSeek | Отправь боту текстовый рецепт |
| ImportJob в БД (статусы) | `docker compose exec postgres psql -U cookbook -c "SELECT id, status, source_type FROM import_jobs ORDER BY created_at DESC LIMIT 5;"` |
| Рецепт в веб-приложении | Открой ссылку из ответа бота |
| Unit тесты | `pnpm test:run` → `16 passed` |

**Следующий план:** Plan 3 — URL-скрапинг (Cheerio + Playwright)
