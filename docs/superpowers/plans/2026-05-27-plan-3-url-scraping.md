# URL Scraping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Позволить пользователю отправить боту ссылку (Instagram, YouTube, кулинарный сайт) и автоматически сохранить рецепт.

**Architecture:** `CheerioScraper` извлекает текст из URL через `fetch` + Cheerio (сначала `og:description`, потом body), передаёт в существующий `IRecipeParser.parseText`. `ImportJobService` получает новый метод `importFromUrl`. `RecipeBot` детектит URL по regex в `onText` и маршрутизирует.

**Tech Stack:** cheerio, fetch (встроен в Node 18+), Vitest, Inversify

---

## Files

**Create:**
- `src/modules/url-scraper/url-scraper.interface.ts` — `IUrlScraper`
- `src/modules/url-scraper/cheerio.scraper.ts` — `CheerioScraper`
- `src/tokens/url-scraper.tokens.ts` — `UrlScraperToken`
- `tests/unit/url-scraper/cheerio.scraper.test.ts` — тесты скрапера
- `tests/unit/bot/recipe-bot.test.ts` — тесты URL-детекции

**Modify:**
- `src/modules/import-jobs/services/import-job.service.interface.ts` — добавить `importFromUrl`
- `src/modules/import-jobs/services/import-job.service.ts` — реализовать `importFromUrl`, добавить `scraper` в конструктор
- `src/modules/bot/recipe-bot.ts` — URL-детекция в `onText`, новое сообщение `/start`
- `src/container.ts` — зарегистрировать `UrlScraperToken → CheerioScraper`
- `tests/unit/import-jobs/import-job.service.test.ts` — добавить `mockScraper` и тесты `importFromUrl`
- `package.json` — добавить `cheerio`

---

### Task 1: IUrlScraper интерфейс, токен, установка cheerio

**Files:**
- Create: `src/modules/url-scraper/url-scraper.interface.ts`
- Create: `src/tokens/url-scraper.tokens.ts`
- Modify: `package.json`

- [ ] **Step 1: Установить cheerio**

```bash
pnpm add cheerio
```

Ожидаем: `cheerio` появляется в `dependencies` в `package.json`.

- [ ] **Step 2: Создать интерфейс `IUrlScraper`**

Создать файл `src/modules/url-scraper/url-scraper.interface.ts`:

```typescript
export interface IUrlScraper {
  scrape(url: string): Promise<string>
}
```

- [ ] **Step 3: Создать токен**

Создать файл `src/tokens/url-scraper.tokens.ts`:

```typescript
import type { ServiceIdentifier } from 'inversify'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'

export const UrlScraperToken: ServiceIdentifier<IUrlScraper> = Symbol.for('UrlScraper')
```

- [ ] **Step 4: Проверить TypeScript**

```bash
pnpm exec tsc --noEmit
```

Ожидаем: нет ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/modules/url-scraper/url-scraper.interface.ts src/tokens/url-scraper.tokens.ts package.json pnpm-lock.yaml
git commit -m "feat: add IUrlScraper interface and token"
```

---

### Task 2: CheerioScraper с TDD

**Files:**
- Create: `src/modules/url-scraper/cheerio.scraper.ts`
- Create: `tests/unit/url-scraper/cheerio.scraper.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать файл `tests/unit/url-scraper/cheerio.scraper.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CheerioScraper } from '@/modules/url-scraper/cheerio.scraper'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(html: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => html } as Response
}

describe('CheerioScraper', () => {
  let scraper: CheerioScraper

  beforeEach(() => {
    scraper = new CheerioScraper()
    vi.clearAllMocks()
  })

  it('returns og:description when it is longer than 200 characters', async () => {
    const ogContent = 'Рецепт борща. '.repeat(20) // 280 chars
    const html = `<html><head><meta property="og:description" content="${ogContent}"></head><body><p>Другой текст</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result).toBe(ogContent)
  })

  it('falls back to body text when og:description is shorter than 200 characters', async () => {
    const html = `<html><head><meta property="og:description" content="Коротко"></head><body><p>Длинный текст рецепта борща с ингредиентами и шагами приготовления</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result).toContain('Длинный текст рецепта борща')
    expect(result).not.toContain('Коротко')
  })

  it('strips script, style, nav, footer, header from body text', async () => {
    const html = `<html><body><nav>Навигация</nav><header>Шапка</header><p>Рецепт</p><footer>Подвал</footer><script>alert(1)</script></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result).toContain('Рецепт')
    expect(result).not.toContain('Навигация')
    expect(result).not.toContain('Шапка')
    expect(result).not.toContain('Подвал')
    expect(result).not.toContain('alert')
  })

  it('truncates body text to 8000 characters', async () => {
    const longText = 'А'.repeat(10000)
    const html = `<html><body><p>${longText}</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.length).toBeLessThanOrEqual(8000)
  })

  it('throws with HTTP status when server returns non-2xx', async () => {
    mockFetch.mockResolvedValue(makeResponse('', 403))

    await expect(scraper.scrape('https://example.com/recipe')).rejects.toThrow('HTTP 403')
  })

  it('passes User-Agent header to fetch', async () => {
    const html = `<html><body><p>text</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    await scraper.scrape('https://example.com/recipe')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/recipe',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla') }),
      }),
    )
  })
})
```

- [ ] **Step 2: Запустить тесты — убедиться что падают**

```bash
pnpm exec vitest run tests/unit/url-scraper/cheerio.scraper.test.ts
```

Ожидаем: FAIL — `Cannot find module '@/modules/url-scraper/cheerio.scraper'`

- [ ] **Step 3: Реализовать CheerioScraper**

Создать файл `src/modules/url-scraper/cheerio.scraper.ts`:

```typescript
import { injectable } from 'inversify'
import * as cheerio from 'cheerio'
import type { IUrlScraper } from './url-scraper.interface'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const OG_MIN_LENGTH = 200
const BODY_MAX_LENGTH = 8000

@injectable()
export class CheerioScraper implements IUrlScraper {
  async scrape(url: string): Promise<string> {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)

    const html = await res.text()
    const $ = cheerio.load(html)

    const ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
    if (ogDescription.length >= OG_MIN_LENGTH) return ogDescription

    $('script, style, nav, footer, header').remove()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    return bodyText.slice(0, BODY_MAX_LENGTH)
  }
}
```

- [ ] **Step 4: Запустить тесты — убедиться что проходят**

```bash
pnpm exec vitest run tests/unit/url-scraper/cheerio.scraper.test.ts
```

Ожидаем: все 6 тестов PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/url-scraper/cheerio.scraper.ts tests/unit/url-scraper/cheerio.scraper.test.ts
git commit -m "feat: add CheerioScraper with TDD"
```

---

### Task 3: importFromUrl в ImportJobService с TDD

**Files:**
- Modify: `src/modules/import-jobs/services/import-job.service.interface.ts`
- Modify: `src/modules/import-jobs/services/import-job.service.ts`
- Modify: `tests/unit/import-jobs/import-job.service.test.ts`

- [ ] **Step 1: Добавить `importFromUrl` в интерфейс**

В файле `src/modules/import-jobs/services/import-job.service.interface.ts` добавить метод:

```typescript
import type { ImportJobEntity } from '../entities/import-job.entity'

export interface IImportJobService {
  importFromText(text: string): Promise<ImportJobEntity>
  importFromPhoto(photoBuffer: Buffer, mimeType: string): Promise<ImportJobEntity>
  importFromUrl(url: string): Promise<ImportJobEntity>
}
```

- [ ] **Step 2: Написать падающие тесты для importFromUrl**

В файле `tests/unit/import-jobs/import-job.service.test.ts` добавить `mockScraper` и новые тесты.

Добавить после `mockRecipeService`:

```typescript
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'

const mockScraper: IUrlScraper = {
  scrape: vi.fn(),
}
```

Изменить строку создания сервиса в `beforeEach`:

```typescript
service = new ImportJobService(mockRepo, mockParser, mockRecipeService, mockScraper)
```

Добавить в `vi.clearAllMocks()` → он уже очищает все моки автоматически.

Добавить тесты в конец `describe('ImportJobService', ...)`:

```typescript
it('importFromUrl: scrapes url, parses text, creates recipe with sourceUrl, updates to done', async () => {
  const urlJob: ImportJobEntity = {
    ...pendingJob,
    sourceType: 'url',
    rawInput: 'https://example.com/recipe',
  }
  vi.mocked(mockRepo.create).mockResolvedValue(urlJob)
  vi.mocked(mockScraper.scrape).mockResolvedValue('Рецепт борща со свёклой')
  vi.mocked(mockParser.parseText).mockResolvedValue(parsedRecipe)
  vi.mocked(mockRecipeService.create).mockResolvedValue(mockRecipe)
  vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)

  const result = await service.importFromUrl('https://example.com/recipe')

  expect(mockRepo.create).toHaveBeenCalledWith({
    sourceType: 'url',
    rawInput: 'https://example.com/recipe',
  })
  expect(mockScraper.scrape).toHaveBeenCalledWith('https://example.com/recipe')
  expect(mockParser.parseText).toHaveBeenCalledWith('Рецепт борща со свёклой')
  expect(mockRecipeService.create).toHaveBeenCalledWith({
    ...parsedRecipe,
    sourceUrl: 'https://example.com/recipe',
  })
  expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'done', { recipeId: 'recipe-1' })
  expect(result.status).toBe('done')
  expect(result.recipeId).toBe('recipe-1')
})

it('importFromUrl: updates to failed when scraper throws', async () => {
  const urlJob: ImportJobEntity = {
    ...pendingJob,
    sourceType: 'url',
    rawInput: 'https://example.com/recipe',
  }
  vi.mocked(mockRepo.create).mockResolvedValue(urlJob)
  vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)
  vi.mocked(mockScraper.scrape).mockRejectedValue(new Error('HTTP 403'))

  const result = await service.importFromUrl('https://example.com/recipe')

  expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'failed', { error: 'HTTP 403' })
  expect(result.status).toBe('failed')
  expect(result.error).toBe('HTTP 403')
})
```

- [ ] **Step 3: Запустить тесты — убедиться что новые падают**

```bash
pnpm exec vitest run tests/unit/import-jobs/import-job.service.test.ts
```

Ожидаем: старые 3 теста PASS, новые 2 — FAIL (метод не существует).

- [ ] **Step 4: Реализовать importFromUrl в ImportJobService**

В файле `src/modules/import-jobs/services/import-job.service.ts` добавить зависимость и метод:

```typescript
import { injectable, inject } from 'inversify'
import { ImportJobRepositoryToken, RecipeParserToken } from '@/tokens/import-job.tokens'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { UrlScraperToken } from '@/tokens/url-scraper.tokens'
import type { IImportJobRepository } from '../repositories/import-job.repository.interface'
import type { IRecipeParser } from './recipe-parser.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { IImportJobService } from './import-job.service.interface'
import type { ImportJobEntity } from '../entities/import-job.entity'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'

@injectable()
export class ImportJobService implements IImportJobService {
  constructor(
    @inject(ImportJobRepositoryToken) private readonly repo: IImportJobRepository,
    @inject(RecipeParserToken) private readonly parser: IRecipeParser,
    @inject(RecipeServiceToken) private readonly recipeService: IRecipeService,
    @inject(UrlScraperToken) private readonly scraper: IUrlScraper,
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

  async importFromUrl(url: string): Promise<ImportJobEntity> {
    const job = await this.repo.create({ sourceType: 'url', rawInput: url })
    try {
      await this.repo.updateStatus(job.id, 'processing')
      const text = await this.scraper.scrape(url)
      const parsed = await this.parser.parseText(text)
      const recipe = await this.recipeService.create({ ...parsed, sourceUrl: url })
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

- [ ] **Step 5: Запустить все тесты — убедиться что проходят**

```bash
pnpm exec vitest run tests/unit/import-jobs/import-job.service.test.ts
```

Ожидаем: все 5 тестов PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/import-jobs/services/import-job.service.interface.ts \
        src/modules/import-jobs/services/import-job.service.ts \
        tests/unit/import-jobs/import-job.service.test.ts
git commit -m "feat: add importFromUrl to ImportJobService"
```

---

### Task 4: URL-детекция в RecipeBot с TDD

**Files:**
- Modify: `src/modules/bot/recipe-bot.ts`
- Create: `tests/unit/bot/recipe-bot.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать файл `tests/unit/bot/recipe-bot.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeBot } from '@/modules/bot/recipe-bot'
import type { IBotAdapter } from '@/modules/bot/bot-adapter.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { ImportJobEntity } from '@/modules/import-jobs/entities/import-job.entity'

const doneJob: ImportJobEntity = {
  id: 'job-1',
  status: 'done',
  sourceType: 'url',
  rawInput: 'https://example.com/recipe',
  recipeId: 'recipe-1',
  error: null,
  createdAt: new Date(),
}

const failedJob: ImportJobEntity = {
  ...doneJob,
  status: 'failed',
  recipeId: null,
  error: 'HTTP 403',
}

let capturedTextHandler: ((text: string) => Promise<string>) | null = null

const mockAdapter: IBotAdapter = {
  onStart: vi.fn(),
  onText: vi.fn((handler) => { capturedTextHandler = handler }),
  onPhoto: vi.fn(),
  start: vi.fn(),
}

const mockService: IImportJobService = {
  importFromText: vi.fn(),
  importFromPhoto: vi.fn(),
  importFromUrl: vi.fn(),
}

describe('RecipeBot URL detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedTextHandler = null
    const bot = new RecipeBot(mockAdapter, mockService)
    bot.register()
  })

  it('routes URL to importFromUrl, not importFromText', async () => {
    vi.mocked(mockService.importFromUrl).mockResolvedValue(doneJob)

    await capturedTextHandler!('https://example.com/recipe')

    expect(mockService.importFromUrl).toHaveBeenCalledWith('https://example.com/recipe')
    expect(mockService.importFromText).not.toHaveBeenCalled()
  })

  it('routes plain text to importFromText, not importFromUrl', async () => {
    vi.mocked(mockService.importFromText).mockResolvedValue({ ...doneJob, sourceType: 'text' })

    await capturedTextHandler!('Рецепт борща')

    expect(mockService.importFromText).toHaveBeenCalledWith('Рецепт борща')
    expect(mockService.importFromUrl).not.toHaveBeenCalled()
  })

  it('returns success message with recipe link for URL import', async () => {
    vi.mocked(mockService.importFromUrl).mockResolvedValue(doneJob)

    const reply = await capturedTextHandler!('https://example.com/recipe')

    expect(reply).toContain('✅')
    expect(reply).toContain('recipe-1')
  })

  it('returns error message when URL import fails', async () => {
    vi.mocked(mockService.importFromUrl).mockResolvedValue(failedJob)

    const reply = await capturedTextHandler!('https://example.com/recipe')

    expect(reply).toContain('❌')
    expect(reply).toContain('HTTP 403')
  })
})
```

- [ ] **Step 2: Запустить тесты — убедиться что падают**

```bash
pnpm exec vitest run tests/unit/bot/recipe-bot.test.ts
```

Ожидаем: FAIL — `mockService.importFromUrl` не вызывается.

- [ ] **Step 3: Добавить URL-детекцию в RecipeBot**

Полностью заменить содержимое `src/modules/bot/recipe-bot.ts`:

```typescript
import type { IBotAdapter } from './bot-adapter.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'

const URL_REGEX = /https?:\/\/\S+/

export class RecipeBot {
  private readonly webUrl: string

  constructor(
    private readonly adapter: IBotAdapter,
    private readonly service: IImportJobService,
  ) {
    this.webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
  }

  register(): this {
    this.adapter.onStart(() =>
      'Привет! Я сохраняю рецепты в твою книгу.\n\n' +
      '📝 Пришли текст рецепта — я распознаю его и сохраню.\n' +
      '🔗 Пришли ссылку на рецепт (Instagram, YouTube, кулинарный сайт).\n' +
      '📷 Пришли фото блюда — попробую распознать рецепт из фото.\n\n' +
      `Смотреть рецепты: ${this.webUrl}`
    )

    this.adapter.onText(async (text) => {
      const trimmed = text.trim()

      if (URL_REGEX.test(trimmed)) {
        const result = await this.service.importFromUrl(trimmed)
        if (result.status === 'done' && result.recipeId) {
          return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
        }
        return (
          `❌ Не удалось извлечь рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
          'Убедись что ссылка публичная и содержит рецепт.'
        )
      }

      const result = await this.service.importFromText(trimmed)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
      }
      return (
        `❌ Не удалось распознать рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
        'Попробуй переформулировать или добавить больше деталей.'
      )
    })

    this.adapter.onPhoto(async (buffer, mimeType) => {
      const result = await this.service.importFromPhoto(buffer, mimeType)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
      }
      return (
        `❌ Не удалось распознать рецепт из фото: ${result.error ?? 'неизвестная ошибка'}\n\n` +
        'Попробуй описать рецепт текстом.'
      )
    })

    return this
  }

  start(): void {
    this.adapter.start()
  }
}
```

- [ ] **Step 4: Запустить тесты — убедиться что проходят**

```bash
pnpm exec vitest run tests/unit/bot/recipe-bot.test.ts
```

Ожидаем: все 4 теста PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/bot/recipe-bot.ts tests/unit/bot/recipe-bot.test.ts
git commit -m "feat: add URL detection in RecipeBot"
```

---

### Task 5: Регистрация в контейнере и финальная проверка

**Files:**
- Modify: `src/container.ts`

- [ ] **Step 1: Зарегистрировать CheerioScraper в контейнере**

В файле `src/container.ts` добавить импорты и биндинг:

```typescript
import 'reflect-metadata'
import { Container } from 'inversify'
import { RecipeRepositoryToken, RecipeServiceToken } from '@/tokens/recipe.tokens'
import { ImportJobRepositoryToken, ImportJobServiceToken, RecipeParserToken, LLMServiceToken } from '@/tokens/import-job.tokens'
import { UrlScraperToken } from '@/tokens/url-scraper.tokens'
import { RecipeRepository } from '@/modules/recipes/repositories/recipe.repository'
import { RecipeService } from '@/modules/recipes/services/recipe.service'
import { ImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository'
import { ImportJobService } from '@/modules/import-jobs/services/import-job.service'
import { LLMService } from '@/modules/import-jobs/services/llm.service'
import { RecipeParser } from '@/modules/import-jobs/services/recipe-parser.service'
import { CheerioScraper } from '@/modules/url-scraper/cheerio.scraper'

export const container = new Container()

container.bind(RecipeRepositoryToken).to(RecipeRepository).inSingletonScope()
container.bind(RecipeServiceToken).to(RecipeService).inSingletonScope()
container.bind(ImportJobRepositoryToken).to(ImportJobRepository).inSingletonScope()
container.bind(LLMServiceToken).to(LLMService).inSingletonScope()
container.bind(RecipeParserToken).to(RecipeParser).inSingletonScope()
container.bind(UrlScraperToken).to(CheerioScraper).inSingletonScope()
container.bind(ImportJobServiceToken).to(ImportJobService).inSingletonScope()
```

- [ ] **Step 2: Проверить TypeScript**

```bash
pnpm exec tsc --noEmit
```

Ожидаем: нет ошибок.

- [ ] **Step 3: Запустить все тесты**

```bash
pnpm exec vitest run
```

Ожидаем: все тесты PASS.

- [ ] **Step 4: Commit**

```bash
git add src/container.ts
git commit -m "feat: wire up CheerioScraper in DI container"
```
