# Recipe Bot — DI Handler Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать bot-модуль с использованием InversifyJS DI: три domain-handler класса (`DraftHandler`, `ImportHandler`, `CallbackHandler`) + `DraftRenderer`, каждый за свою зону ответственности, `RecipeBot` зависит только от интерфейсов.

**Architecture:** Каждый handler — `@injectable()` класс, зависимости через `@inject(Token)`. `RecipeBot` получает `IDraftHandler`, `IImportHandler`, `ICallbackHandler` и `IBotAdapter` через конструктор. Routing (есть черновик / нет) — единственная логика в `RecipeBot`. Все классы регистрируются в `container.ts`.

**Tech Stack:** TypeScript, InversifyJS (`@injectable`, `@inject`), `reflect-metadata`, Vitest.

---

## File Map

| Действие | Файл |
|---|---|
| Create | `src/modules/bot/bot.tokens.ts` |
| Create | `src/modules/bot/renderer/draft.renderer.ts` |
| Create | `src/modules/bot/handlers/draft.handler.interface.ts` |
| Create | `src/modules/bot/handlers/import.handler.interface.ts` |
| Create | `src/modules/bot/handlers/callback.handler.interface.ts` |
| Create | `src/modules/bot/handlers/import.handler.ts` |
| Create | `src/modules/bot/handlers/callback.handler.ts` |
| Create | `src/modules/bot/handlers/draft.handler.ts` |
| Rewrite | `src/modules/bot/recipe-bot.ts` |
| Modify | `src/container.ts` |
| Delete | `src/modules/bot/draft-text-handler.ts` |
| Delete | `src/modules/bot/draft-photo-handler.ts` |
| Delete | `src/modules/bot/draft-callbacks.ts` |
| Delete | `src/modules/bot/draft-renderer.ts` |
| Rewrite | `tests/unit/bot/recipe-bot.test.ts` |
| Create | `tests/unit/bot/handlers/draft.handler.test.ts` |
| Create | `tests/unit/bot/handlers/import.handler.test.ts` |
| Create | `tests/unit/bot/handlers/callback.handler.test.ts` |

---

## Task 1: Токены и интерфейсы

**Files:**
- Create: `src/modules/bot/bot.tokens.ts`
- Create: `src/modules/bot/handlers/draft.handler.interface.ts`
- Create: `src/modules/bot/handlers/import.handler.interface.ts`
- Create: `src/modules/bot/handlers/callback.handler.interface.ts`

- [ ] **Step 1: Создать `bot.tokens.ts`**

```typescript
// src/modules/bot/bot.tokens.ts
export const RecipeBotToken       = Symbol('RecipeBot')
export const DraftHandlerToken    = Symbol('DraftHandler')
export const ImportHandlerToken   = Symbol('ImportHandler')
export const CallbackHandlerToken = Symbol('CallbackHandler')
export const DraftRendererToken   = Symbol('DraftRenderer')
```

- [ ] **Step 2: Создать `draft.handler.interface.ts`**

```typescript
// src/modules/bot/handlers/draft.handler.interface.ts
import type { SetStatus } from '../bot-adapter.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

export interface IDraftHandler {
  handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string>
  handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string>
}
```

- [ ] **Step 3: Создать `import.handler.interface.ts`**

```typescript
// src/modules/bot/handlers/import.handler.interface.ts
import type { SetStatus } from '../bot-adapter.interface'

export interface IImportHandler {
  handleText(text: string, setStatus?: SetStatus): Promise<string>
  handlePhoto(buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string>
}
```

- [ ] **Step 4: Создать `callback.handler.interface.ts`**

```typescript
// src/modules/bot/handlers/callback.handler.interface.ts
import type { BotResponse } from '../bot-adapter.interface'

export interface ICallbackHandler {
  handle(data: string, context: { chatId: string; userId: string }): Promise<BotResponse>
}
```

- [ ] **Step 5: Запустить все тесты — должны пройти (код ещё не изменён)**

```bash
pnpm vitest run
```

Ожидаем: все тесты зелёные.

- [ ] **Step 6: Коммит**

```bash
git add src/modules/bot/bot.tokens.ts \
        src/modules/bot/handlers/draft.handler.interface.ts \
        src/modules/bot/handlers/import.handler.interface.ts \
        src/modules/bot/handlers/callback.handler.interface.ts
git commit -m "feat(bot): add DI tokens and handler interfaces"
```

---

## Task 2: `DraftRenderer`

**Files:**
- Create: `src/modules/bot/renderer/draft.renderer.ts`

- [ ] **Step 1: Написать тест**

```typescript
// tests/unit/bot/renderer/draft.renderer.test.ts
import { describe, it, expect } from 'vitest'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const baseDraft: RecipeDraftEntity = {
  id: 'draft-1',
  channel: 'telegram',
  channelChatId: 'chat-1',
  channelUserId: 'user-1',
  state: 'editing',
  sourceType: 'manual',
  title: 'Борщ',
  ingredients: [{ name: 'свёкла', amount: '300', unit: 'г' }],
  steps: [{ order: 1, text: 'Нарезать' }],
  cookTimeMinutes: 60,
  servings: 4,
  tags: [],
  sourceText: null,
  sourceUrl: null,
  coverImageKey: null,
  videoUrl: null,
  lastAiSuggestion: null,
  pendingAction: null,
  recipeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(),
}

describe('DraftRenderer', () => {
  const renderer = new DraftRenderer()

  it('renderDraftText включает название', () => {
    expect(renderer.renderDraftText(baseDraft)).toContain('Борщ')
  })

  it('renderDraftText включает количество ингредиентов и шагов', () => {
    const text = renderer.renderDraftText(baseDraft)
    expect(text).toContain('Ингредиентов: 1')
    expect(text).toContain('Шагов: 1')
  })

  it('renderDraft возвращает text и buttons', () => {
    const resp = renderer.renderDraft(baseDraft)
    expect(resp.text).toContain('Борщ')
    expect(resp.buttons?.flat().map(b => b.data)).toContain(`draft:save:draft-1`)
  })

  it('renderDraftMenuButtons содержит все 7 кнопок', () => {
    const buttons = renderer.renderDraftMenuButtons('draft-1')
    expect(buttons).toHaveLength(7)
  })

  it('renderUnknownCallback возвращает BotResponse с кнопками', () => {
    const resp = renderer.renderUnknownCallback()
    expect(resp.buttons?.flat().map(b => b.data)).toContain('new_recipe')
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm vitest run tests/unit/bot/renderer/draft.renderer.test.ts
```

Ожидаем: FAIL — `Cannot find module '@/modules/bot/renderer/draft.renderer'`

- [ ] **Step 3: Реализовать `DraftRenderer`**

```typescript
// src/modules/bot/renderer/draft.renderer.ts
import { injectable } from 'inversify'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { BotResponse } from '../bot-adapter.interface'

@injectable()
export class DraftRenderer {
  renderDraft(draft: RecipeDraftEntity): BotResponse {
    return {
      text: this.renderDraftText(draft),
      buttons: this.renderDraftMenuButtons(draft.id),
    }
  }

  renderDraftText(draft: RecipeDraftEntity): string {
    const title = draft.title ?? 'без названия'
    const cookTime = draft.cookTimeMinutes ? `${draft.cookTimeMinutes} мин` : '—'
    const servings = draft.servings ? String(draft.servings) : '—'
    const photoStatus = draft.coverImageKey ? 'прикреплено' : 'нет'
    const videoStatus = draft.videoUrl ? 'добавлена' : 'нет'

    return (
      `📋 Черновик: ${title}\n\n` +
      `Ингредиентов: ${draft.ingredients.length}\n` +
      `Шагов: ${draft.steps.length}\n` +
      `Время готовки: ${cookTime}\n` +
      `Порций: ${servings}\n` +
      `Фото: ${photoStatus}\n` +
      `Видео-ссылка: ${videoStatus}`
    )
  }

  renderDraftMenuButtons(draftId: string): BotResponse['buttons'] {
    return [
      [{ text: '🥕 Добавить ингредиент', data: `draft:add_ingredient:${draftId}` }],
      [{ text: '📝 Добавить шаг', data: `draft:add_step:${draftId}` }],
      [{ text: '📷 Прикрепить фото', data: `draft:add_photo:${draftId}` }],
      [{ text: '🎬 Добавить видео-ссылку', data: `draft:add_video:${draftId}` }],
      [{ text: '🤖 Спросить ИИ (свободный текст)', data: `draft:ask_ai:${draftId}` }],
      [{ text: '💡 Заполнить недостающее', data: `draft:suggest_missing:${draftId}` }],
      [{ text: '💾 Сохранить', data: `draft:save:${draftId}` }],
    ]
  }

  renderUnknownCallback(): BotResponse {
    return {
      text: 'Не понял действие. Можно создать новый рецепт или продолжить активный черновик.',
      buttons: [
        [{ text: 'Создать рецепт', data: 'new_recipe' }],
        [{ text: 'Продолжить черновик', data: 'continue_draft' }],
      ],
    }
  }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm vitest run tests/unit/bot/renderer/draft.renderer.test.ts
```

Ожидаем: 5 тестов, все зелёные.

- [ ] **Step 5: Коммит**

```bash
git add src/modules/bot/renderer/draft.renderer.ts \
        tests/unit/bot/renderer/draft.renderer.test.ts
git commit -m "feat(bot): add DraftRenderer injectable class with tests"
```

---

## Task 3: `ImportHandler`

**Files:**
- Create: `src/modules/bot/handlers/import.handler.ts`
- Create: `tests/unit/bot/handlers/import.handler.test.ts`

- [ ] **Step 1: Написать тест**

```typescript
// tests/unit/bot/handlers/import.handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportHandler } from '@/modules/bot/handlers/import.handler'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { ImportJobEntity } from '@/modules/import-jobs/entities/import-job.entity'

const doneJob: ImportJobEntity = {
  id: 'job-1',
  status: 'done',
  sourceType: 'url',
  rawInput: 'https://example.com',
  recipeId: 'recipe-1',
  error: null,
  createdAt: new Date(),
}

const failedJob: ImportJobEntity = { ...doneJob, status: 'failed', recipeId: null, error: 'HTTP 403' }

const mockImport: IImportJobService = {
  importFromText: vi.fn(),
  importFromPhoto: vi.fn(),
  importFromUrl: vi.fn(),
  importFromTextWithPhoto: vi.fn(),
}

describe('ImportHandler', () => {
  let handler: ImportHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new ImportHandler(mockImport)
  })

  it('handleText с URL вызывает importFromUrl', async () => {
    vi.mocked(mockImport.importFromUrl).mockResolvedValue(doneJob)
    const result = await handler.handleText('https://example.com')
    expect(mockImport.importFromUrl).toHaveBeenCalledWith('https://example.com')
    expect(result).toContain('✅')
    expect(result).toContain('recipe-1')
  })

  it('handleText с обычным текстом вызывает importFromText', async () => {
    vi.mocked(mockImport.importFromText).mockResolvedValue({ ...doneJob, sourceType: 'text' })
    const result = await handler.handleText('Рецепт борща')
    expect(mockImport.importFromText).toHaveBeenCalledWith('Рецепт борща')
    expect(result).toContain('✅')
  })

  it('handleText возвращает ошибку при failed статусе', async () => {
    vi.mocked(mockImport.importFromUrl).mockResolvedValue(failedJob)
    const result = await handler.handleText('https://example.com')
    expect(result).toContain('❌')
    expect(result).toContain('HTTP 403')
  })

  it('handlePhoto без caption вызывает importFromPhoto', async () => {
    vi.mocked(mockImport.importFromPhoto).mockResolvedValue(doneJob)
    const result = await handler.handlePhoto(Buffer.from(''), 'image/jpeg')
    expect(mockImport.importFromPhoto).toHaveBeenCalled()
    expect(result).toContain('✅')
  })

  it('handlePhoto с caption вызывает importFromTextWithPhoto', async () => {
    vi.mocked(mockImport.importFromTextWithPhoto).mockResolvedValue(doneJob)
    const result = await handler.handlePhoto(Buffer.from(''), 'image/jpeg', 'Рецепт борща')
    expect(mockImport.importFromTextWithPhoto).toHaveBeenCalledWith('Рецепт борща', expect.any(Buffer), 'image/jpeg')
    expect(result).toContain('✅')
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm vitest run tests/unit/bot/handlers/import.handler.test.ts
```

Ожидаем: FAIL — `Cannot find module '@/modules/bot/handlers/import.handler'`

- [ ] **Step 3: Реализовать `ImportHandler`**

```typescript
// src/modules/bot/handlers/import.handler.ts
import { injectable, inject } from 'inversify'
import { ImportJobServiceToken } from '@/tokens/import-job.tokens'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { IImportHandler } from './import.handler.interface'
import type { SetStatus } from '../bot-adapter.interface'

const URL_REGEX = /https?:\/\/\S+/
const WEB_URL = () => process.env.WEB_URL ?? 'http://localhost:3000'

@injectable()
export class ImportHandler implements IImportHandler {
  constructor(
    @inject(ImportJobServiceToken)
    private readonly importService: IImportJobService,
  ) {}

  async handleText(text: string, setStatus?: SetStatus): Promise<string> {
    if (URL_REGEX.test(text)) {
      await setStatus?.('🔗 Извлекаю рецепт из ссылки...')
      const result = await this.importService.importFromUrl(text)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${WEB_URL()}/recipes/${result.recipeId}`
      }
      return `❌ Не удалось извлечь рецепт: ${result.error ?? 'неизвестная ошибка'}\nУбедись что ссылка публичная и содержит рецепт.`
    }

    await setStatus?.('🤖 Распознаю рецепт из текста...')
    const result = await this.importService.importFromText(text)
    if (result.status === 'done' && result.recipeId) {
      return `✅ Рецепт сохранён!\n${WEB_URL()}/recipes/${result.recipeId}`
    }
    return `❌ Не удалось распознать рецепт: ${result.error ?? 'неизвестная ошибка'}\nПопробуй переформулировать или добавить больше деталей.`
  }

  async handlePhoto(buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string> {
    await setStatus?.('🤖 Распознаю рецепт из фото...')
    const result = caption
      ? await this.importService.importFromTextWithPhoto(caption, buffer, mimeType)
      : await this.importService.importFromPhoto(buffer, mimeType)
    if (result.status === 'done' && result.recipeId) {
      return `✅ Рецепт сохранён!\n${WEB_URL()}/recipes/${result.recipeId}`
    }
    return `❌ Не удалось распознать рецепт из фото: ${result.error ?? 'неизвестная ошибка'}\n\nПопробуй описать рецепт текстом или добавь подпись к фото.`
  }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm vitest run tests/unit/bot/handlers/import.handler.test.ts
```

Ожидаем: 5 тестов, все зелёные.

- [ ] **Step 5: Коммит**

```bash
git add src/modules/bot/handlers/import.handler.ts \
        tests/unit/bot/handlers/import.handler.test.ts
git commit -m "feat(bot): add ImportHandler injectable class with tests"
```

---

## Task 4: `CallbackHandler`

**Files:**
- Create: `src/modules/bot/handlers/callback.handler.ts`
- Create: `tests/unit/bot/handlers/callback.handler.test.ts`

- [ ] **Step 1: Написать тест**

```typescript
// tests/unit/bot/handlers/callback.handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CallbackHandler } from '@/modules/bot/handlers/callback.handler'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const ctx = { chatId: 'chat-1', userId: 'user-1' }

const draft: RecipeDraftEntity = {
  id: 'draft-1',
  channel: 'telegram',
  channelChatId: 'chat-1',
  channelUserId: 'user-1',
  state: 'editing',
  sourceType: 'manual',
  title: null,
  ingredients: [],
  steps: [],
  cookTimeMinutes: null,
  servings: null,
  tags: [],
  sourceText: null,
  sourceUrl: null,
  coverImageKey: null,
  videoUrl: null,
  lastAiSuggestion: null,
  pendingAction: null,
  recipeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(),
}

const mockDraftService: IRecipeDraftService = {
  createDraft: vi.fn(),
  getActiveDraft: vi.fn(),
  updateDraft: vi.fn(),
  attachCoverImage: vi.fn(),
  attachVideoUrl: vi.fn(),
  setEditing: vi.fn(),
  setConfirming: vi.fn(),
  saveDraft: vi.fn(),
  markSaved: vi.fn(),
  discardDraft: vi.fn(),
}

const mockAssistant: IRecipeAssistantService = {
  suggestFromText: vi.fn(),
  suggestFromPhoto: vi.fn(),
  normalizeSteps: vi.fn(),
  normalizeIngredient: vi.fn(),
  classifyText: vi.fn(),
  classifyPhoto: vi.fn(),
  suggestMissingFields: vi.fn(),
}

describe('CallbackHandler', () => {
  let handler: CallbackHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new CallbackHandler(mockDraftService, mockAssistant, new DraftRenderer())
  })

  it('new_recipe — создаёт черновик и возвращает меню', async () => {
    vi.mocked(mockDraftService.createDraft).mockResolvedValue(draft)
    const resp = await handler.handle('new_recipe', ctx)
    expect(mockDraftService.createDraft).toHaveBeenCalledWith({
      channel: 'telegram',
      channelChatId: 'chat-1',
      channelUserId: 'user-1',
      sourceType: 'manual',
    })
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:save:draft-1')
  })

  it('continue_draft — возвращает активный черновик', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    const resp = await handler.handle('continue_draft', ctx)
    expect(resp.text).toContain('Черновик')
  })

  it('continue_draft — нет черновика → предлагает создать', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(null)
    const resp = await handler.handle('continue_draft', ctx)
    expect(resp.text).toContain('Активного черновика пока нет')
  })

  it('draft:add_ingredient:id — устанавливает pendingAction', async () => {
    vi.mocked(mockDraftService.updateDraft).mockResolvedValue({ ...draft, pendingAction: 'waiting_for_ingredient' })
    const resp = await handler.handle('draft:add_ingredient:draft-1', ctx)
    expect(mockDraftService.updateDraft).toHaveBeenCalledWith('draft-1', { pendingAction: 'waiting_for_ingredient' })
    expect(resp.text).toContain('ингредиент')
  })

  it('draft:save:id — переводит в подтверждение', async () => {
    vi.mocked(mockDraftService.setConfirming).mockResolvedValue(draft)
    const resp = await handler.handle('draft:save:draft-1', ctx)
    expect(mockDraftService.setConfirming).toHaveBeenCalledWith('draft-1')
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:confirm_save:draft-1')
  })

  it('draft:back:id — возвращает в editing', async () => {
    vi.mocked(mockDraftService.setEditing).mockResolvedValue(draft)
    const resp = await handler.handle('draft:back:draft-1', ctx)
    expect(mockDraftService.setEditing).toHaveBeenCalledWith('draft-1')
  })

  it('неизвестный action — возвращает renderUnknownCallback', async () => {
    const resp = await handler.handle('draft:unknown_action:draft-1', ctx)
    expect(resp.buttons?.flat().map(b => b.data)).toContain('new_recipe')
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm vitest run tests/unit/bot/handlers/callback.handler.test.ts
```

Ожидаем: FAIL — `Cannot find module '@/modules/bot/handlers/callback.handler'`

- [ ] **Step 3: Реализовать `CallbackHandler`**

```typescript
// src/modules/bot/handlers/callback.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken, RecipeAssistantServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { BotResponse } from '../bot-adapter.interface'
import type { ICallbackHandler } from './callback.handler.interface'

@injectable()
export class CallbackHandler implements ICallbackHandler {
  constructor(
    @inject(RecipeDraftServiceToken)   private readonly draftService: IRecipeDraftService,
    @inject(RecipeAssistantServiceToken) private readonly assistant: IRecipeAssistantService,
    @inject(DraftRendererToken)        private readonly renderer: DraftRenderer,
  ) {}

  async handle(data: string, context: { chatId: string; userId: string }): Promise<BotResponse> {
    if (data === 'new_recipe') {
      const draft = await this.draftService.createDraft({
        channel: 'telegram',
        channelChatId: context.chatId,
        channelUserId: context.userId,
        sourceType: 'manual',
      })
      return this.renderer.renderDraft(draft)
    }

    if (data === 'continue_draft') {
      const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
      if (!draft) {
        return {
          text: 'Активного черновика пока нет. Можем создать новый.',
          buttons: [[{ text: 'Создать рецепт', data: 'new_recipe' }]],
        }
      }
      return this.renderer.renderDraft(draft)
    }

    const [scope, action, id] = data.split(':')
    if (scope !== 'draft' || !action || !id) return this.renderer.renderUnknownCallback()

    return this.handleDraftAction(action, id, context)
  }

  private async handleDraftAction(
    action: string,
    id: string,
    context: { chatId: string; userId: string },
  ): Promise<BotResponse> {
    const buttons = () => this.renderer.renderDraftMenuButtons(id)

    switch (action) {
      case 'add_ingredient':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_ingredient' })
        return {
          text: '🥕 Пришли ингредиент. Например: «200 г муки» или «щепотка соли».\nМожно несколько в одном сообщении — по одному на строку.',
          buttons: buttons(),
        }

      case 'add_step':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_step' })
        return {
          text: '📝 Пришли шаг (или несколько сразу). ИИ нормализует и разобьёт их автоматически.',
          buttons: buttons(),
        }

      case 'add_photo':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_photo' })
        return {
          text: '📷 Пришли фото. ИИ сам определит — это обложка блюда, фото шага или фото с текстом рецепта.',
          buttons: buttons(),
        }

      case 'add_video':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_video' })
        return { text: '🎬 Пришли ссылку на видео с рецептом.', buttons: buttons() }

      case 'ask_ai': {
        const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
        if (!draft) return this.renderer.renderUnknownCallback()
        return {
          text:
            '🤖 Режим ИИ-помощника. Напиши что угодно:\n' +
            '• шаги приготовления\n' +
            '• ингредиенты\n' +
            '• вопрос о рецепте\n\n' +
            'ИИ сам поймёт что ты имеешь в виду и добавит в черновик.',
          buttons: this.renderer.renderDraftMenuButtons(draft.id),
        }
      }

      case 'suggest_missing': {
        const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
        if (!draft) return this.renderer.renderUnknownCallback()
        const suggestions = await this.assistant.suggestMissingFields(draft)
        if (!suggestions.length) {
          return { text: '✅ Черновик выглядит полным! Можно сохранять.', buttons: buttons() }
        }
        const patch: Record<string, unknown> = {}
        let text = '💡 ИИ заполнил недостающие поля:\n\n'
        for (const s of suggestions) { patch[s.field] = s.value; text += `• ${s.suggestion}\n` }
        const updated = await this.draftService.updateDraft(id, patch as Partial<RecipeDraftEntity>)
        return { text, buttons: this.renderer.renderDraftMenuButtons(updated.id) }
      }

      case 'save':
        await this.draftService.setConfirming(id)
        return {
          text: 'Проверь черновик перед сохранением. Финальное сохранение появится на следующем шаге.',
          buttons: [
            [{ text: 'Подтвердить сохранение', data: `draft:confirm_save:${id}` }],
            [{ text: 'Вернуться к черновику', data: `draft:back:${id}` }],
          ],
        }

      case 'confirm_save':
        try {
          const recipe = await this.draftService.saveDraft(id)
          return {
            text: `✅ Рецепт сохранён!\n${process.env.WEB_URL ?? 'http://localhost:3000'}/recipes/${recipe.id}\n\nЧерновик помечен как сохранённый.`,
          }
        } catch (error) {
          return {
            text: `❌ Не удалось сохранить черновик: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
            buttons: buttons(),
          }
        }

      case 'back':
        await this.draftService.setEditing(id)
        return { text: 'Возвращаюсь к черновику.', buttons: buttons() }

      default:
        return this.renderer.renderUnknownCallback()
    }
  }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm vitest run tests/unit/bot/handlers/callback.handler.test.ts
```

Ожидаем: 7 тестов, все зелёные.

- [ ] **Step 5: Коммит**

```bash
git add src/modules/bot/handlers/callback.handler.ts \
        tests/unit/bot/handlers/callback.handler.test.ts
git commit -m "feat(bot): add CallbackHandler injectable class with tests"
```

---

## Task 5: `DraftHandler`

**Files:**
- Create: `src/modules/bot/handlers/draft.handler.ts`
- Create: `tests/unit/bot/handlers/draft.handler.test.ts`

- [ ] **Step 1: Написать тест**

```typescript
// tests/unit/bot/handlers/draft.handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftHandler } from '@/modules/bot/handlers/draft.handler'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service.interface'
import type { IImportHandler } from '@/modules/bot/handlers/import.handler.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const baseDraft: RecipeDraftEntity = {
  id: 'draft-1',
  channel: 'telegram',
  channelChatId: 'chat-1',
  channelUserId: 'user-1',
  state: 'editing',
  sourceType: 'manual',
  title: null,
  ingredients: [],
  steps: [],
  cookTimeMinutes: null,
  servings: null,
  tags: [],
  sourceText: null,
  sourceUrl: null,
  coverImageKey: null,
  videoUrl: null,
  lastAiSuggestion: null,
  pendingAction: null,
  recipeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(),
}

const mockDraftService: IRecipeDraftService = {
  createDraft: vi.fn(),
  getActiveDraft: vi.fn(),
  updateDraft: vi.fn(),
  attachCoverImage: vi.fn(),
  attachVideoUrl: vi.fn(),
  setEditing: vi.fn(),
  setConfirming: vi.fn(),
  saveDraft: vi.fn(),
  markSaved: vi.fn(),
  discardDraft: vi.fn(),
}

const mockAssistant: IRecipeAssistantService = {
  suggestFromText: vi.fn(),
  suggestFromPhoto: vi.fn(),
  normalizeSteps: vi.fn(),
  normalizeIngredient: vi.fn(),
  classifyText: vi.fn(),
  classifyPhoto: vi.fn(),
  suggestMissingFields: vi.fn(),
}

const mockImportHandler: IImportHandler = {
  handleText: vi.fn(),
  handlePhoto: vi.fn(),
}

describe('DraftHandler', () => {
  let handler: DraftHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new DraftHandler(mockDraftService, mockAssistant, mockImportHandler, new DraftRenderer())
  })

  it('waiting_for_step — normalizeSteps и сохраняет', async () => {
    const draft = { ...baseDraft, pendingAction: 'waiting_for_step' as const }
    vi.mocked(mockAssistant.normalizeSteps).mockResolvedValue([{ order: 1, text: 'Нарезать лук' }])
    vi.mocked(mockDraftService.updateDraft).mockResolvedValue({ ...draft, steps: [{ order: 1, text: 'Нарезать лук' }], pendingAction: null })
    vi.mocked(mockAssistant.suggestMissingFields).mockResolvedValue([])

    const result = await handler.handleText(draft, 'нарезать лук')
    expect(mockAssistant.normalizeSteps).toHaveBeenCalledWith('нарезать лук', 0)
    expect(result).toContain('✅')
    expect(result).toContain('Нарезать лук')
  })

  it('waiting_for_ingredient — normalizeIngredient и сохраняет', async () => {
    const draft = { ...baseDraft, pendingAction: 'waiting_for_ingredient' as const }
    vi.mocked(mockAssistant.normalizeIngredient).mockResolvedValue({ name: 'мука', amount: '200', unit: 'г' })
    vi.mocked(mockDraftService.updateDraft).mockResolvedValue({ ...draft, ingredients: [{ name: 'мука', amount: '200', unit: 'г' }], pendingAction: null })
    vi.mocked(mockAssistant.suggestMissingFields).mockResolvedValue([])

    const result = await handler.handleText(draft, '200 г муки')
    expect(mockAssistant.normalizeIngredient).toHaveBeenCalledWith('200 г муки')
    expect(result).toContain('✅')
    expect(result).toContain('мука')
  })

  it('waiting_for_video — сохраняет URL видео', async () => {
    const draft = { ...baseDraft, pendingAction: 'waiting_for_video' as const }
    vi.mocked(mockDraftService.attachVideoUrl).mockResolvedValue(draft)
    vi.mocked(mockDraftService.updateDraft).mockResolvedValue({ ...draft, pendingAction: null })

    const result = await handler.handleText(draft, 'https://youtube.com/watch?v=abc')
    expect(mockDraftService.attachVideoUrl).toHaveBeenCalledWith('draft-1', 'https://youtube.com/watch?v=abc')
    expect(result).toContain('🎬')
  })

  it('waiting_for_video — не URL → просит ссылку', async () => {
    const draft = { ...baseDraft, pendingAction: 'waiting_for_video' as const }
    const result = await handler.handleText(draft, 'просто текст')
    expect(result).toContain('Нужна ссылка')
  })

  it('null pendingAction — classifyText вызывается', async () => {
    vi.mocked(mockAssistant.classifyText).mockResolvedValue({
      type: 'steps',
      steps: [{ order: 1, text: 'Обжарить лук' }],
    })
    vi.mocked(mockDraftService.updateDraft).mockResolvedValue({ ...baseDraft, steps: [{ order: 1, text: 'Обжарить лук' }] })

    const result = await handler.handleText(baseDraft, 'обжарить лук')
    expect(mockAssistant.classifyText).toHaveBeenCalled()
    expect(result).toContain('✅')
  })

  it('classifyText type=question — возвращает ответ без сохранения', async () => {
    vi.mocked(mockAssistant.classifyText).mockResolvedValue({
      type: 'question',
      answer: 'Борщ варится 90 минут.',
    })

    const result = await handler.handleText(baseDraft, 'сколько варить борщ?')
    expect(mockDraftService.updateDraft).not.toHaveBeenCalled()
    expect(result).toContain('Борщ варится 90 минут.')
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm vitest run tests/unit/bot/handlers/draft.handler.test.ts
```

Ожидаем: FAIL — `Cannot find module '@/modules/bot/handlers/draft.handler'`

- [ ] **Step 3: Реализовать `DraftHandler`**

```typescript
// src/modules/bot/handlers/draft.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken, RecipeAssistantServiceToken } from '@/tokens/recipe-draft.tokens'
import { ImportHandlerToken, DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecipeAssistantService, TextClassificationResult } from '@/modules/recipe-drafts/services/recipe-assistant.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { IImportHandler } from './import.handler.interface'
import type { IDraftHandler } from './draft.handler.interface'
import type { SetStatus } from '../bot-adapter.interface'

const URL_REGEX = /https?:\/\/\S+/
const CLASSIFY_TIMEOUT_MS = 33_000

@injectable()
export class DraftHandler implements IDraftHandler {
  constructor(
    @inject(RecipeDraftServiceToken)     private readonly draftService: IRecipeDraftService,
    @inject(RecipeAssistantServiceToken) private readonly assistant: IRecipeAssistantService,
    @inject(ImportHandlerToken)          private readonly importHandler: IImportHandler,
    @inject(DraftRendererToken)          private readonly renderer: DraftRenderer,
  ) {}

  // ── Text ──────────────────────────────────────

  async handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    if (draft.pendingAction === 'waiting_for_video') {
      return this.handleVideoUrl(draft, text)
    }
    if (draft.pendingAction === 'waiting_for_step') {
      return this.handleStep(draft, text, setStatus)
    }
    if (draft.pendingAction === 'waiting_for_ingredient') {
      return this.handleIngredient(draft, text, setStatus)
    }
    return this.handleFreeText(draft, text, setStatus)
  }

  // ── Photo ─────────────────────────────────────

  async handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string> {
    const base64 = buffer.toString('base64')

    try {
      await setStatus?.('🔍 ИИ классифицирует фото...')
      let elapsed = 0
      const ticker = setInterval(() => { elapsed += 5; setStatus?.(`🔍 ИИ классифицирует фото... (${elapsed}с)`) }, 5000)

      let classification: Awaited<ReturnType<typeof this.assistant.classifyPhoto>>
      try {
        classification = await Promise.race([
          this.assistant.classifyPhoto(base64, mimeType, draft, caption),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('classifyPhoto timeout')), CLASSIFY_TIMEOUT_MS)),
        ])
      } finally {
        clearInterval(ticker)
      }

      if (classification.type === 'cover') {
        return (
          '🖼 ИИ определил: это фото готового блюда (обложка).\n\n' +
          '⚠️ Загрузка фото в хранилище пока не интегрирована в этом потоке. ' +
          'Используй кнопку «Прикрепить фото» после загрузки через веб-интерфейс.\n\n' +
          this.renderer.renderDraftText(draft)
        )
      }

      if (classification.type === 'step') {
        const step = draft.steps.find(s => s.order === classification.stepOrder)
        return (
          `📸 ИИ определил: фото к шагу ${classification.stepOrder}${step ? ` («${step.text.slice(0, 40)}…»)` : ''}.\n\n` +
          '⚠️ Прикрепление фото к шагам пока не поддерживается в данных.\n\n' +
          this.renderer.renderDraftText(draft)
        )
      }

      if (classification.type === 'recipe') {
        return this.applyExtractedRecipe(draft, classification.extracted, setStatus)
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'classifyPhoto timeout'
      console.error('[DraftHandler] classifyPhoto failed:', err)
      await setStatus?.(isTimeout
        ? '⚠️ ИИ не ответил вовремя, пробую распознать рецепт напрямую...'
        : '⚠️ Не удалось классифицировать фото, пробую распознать рецепт напрямую...'
      )
    }

    return this.importHandler.handlePhoto(buffer, mimeType, caption, setStatus)
  }

  // ── Private helpers ───────────────────────────

  private async handleVideoUrl(draft: RecipeDraftEntity, text: string): Promise<string> {
    if (!URL_REGEX.test(text)) return '🎬 Нужна ссылка (http/https). Попробуй ещё раз.'
    try {
      const updated = await this.draftService.attachVideoUrl(draft.id, text)
      await this.draftService.updateDraft(draft.id, { pendingAction: null })
      return `🎬 Видео добавлено!\n\n${this.renderer.renderDraftText(updated)}`
    } catch {
      return '❌ Не удалось добавить ссылку. Убедись, что это http/https ссылка.'
    }
  }

  private async handleStep(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    try {
      await setStatus?.('🤖 ИИ нормализует шаги...')
      const newSteps = await this.assistant.normalizeSteps(text, draft.steps.length)
      await setStatus?.('💾 Сохраняю шаги в черновик...')
      const updated = await this.draftService.updateDraft(draft.id, {
        steps: [...draft.steps, ...newSteps],
        pendingAction: null,
      })
      const addedText = newSteps.map(s => `${s.order}. ${s.text}`).join('\n')
      return (
        `✅ Добавлено ${newSteps.length} шаг(ов):\n${addedText}\n\n` +
        this.renderer.renderDraftText(updated) +
        await this.buildMissingSuggestion(updated)
      )
    } catch (err) {
      console.error('[DraftHandler] normalizeSteps failed:', err)
      return '❌ Не удалось обработать шаги. Попробуй переформулировать.'
    }
  }

  private async handleIngredient(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const added: Array<{ name: string; amount: string; unit: string }> = []
    const failed: string[] = []

    for (const line of lines) {
      try {
        await setStatus?.(`🤖 Разбираю: «${line.slice(0, 30)}»...`)
        added.push(await this.assistant.normalizeIngredient(line))
      } catch (err) {
        console.error('[DraftHandler] normalizeIngredient failed:', err)
        failed.push(line)
      }
    }

    if (!added.length) return '❌ Не удалось распознать ингредиенты. Попробуй формат: «200 г муки»'

    const updated = await this.draftService.updateDraft(draft.id, {
      ingredients: [...draft.ingredients, ...added],
      pendingAction: null,
    })
    const addedText = added.map(i => `• ${i.amount} ${i.unit} ${i.name}`.trim()).join('\n')
    const failedText = failed.length ? `\n\n⚠️ Не удалось распознать:\n${failed.join('\n')}` : ''
    return (
      `✅ Добавлено ${added.length} ингредиент(ов):\n${addedText}${failedText}\n\n` +
      this.renderer.renderDraftText(updated) +
      await this.buildMissingSuggestion(updated)
    )
  }

  private async handleFreeText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    try {
      await setStatus?.('🤖 ИИ анализирует сообщение...')
      let elapsed = 0
      const ticker = setInterval(() => { elapsed += 5; setStatus?.(`🤖 ИИ анализирует сообщение... (${elapsed}с)`) }, 5000)

      let result: TextClassificationResult
      try {
        result = await Promise.race([
          this.assistant.classifyText(text, draft),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('classifyText timeout')), 25_000)),
        ])
      } finally {
        clearInterval(ticker)
      }

      await setStatus?.('💾 Применяю изменения...')
      return this.applyClassificationResult(draft, result)
    } catch (err) {
      console.error('[DraftHandler] classifyText failed:', err)
      return (
        '🤖 Не смог автоматически распознать тип сообщения. ' +
        'Используй кнопки ниже чтобы уточнить что именно ты хочешь добавить.\n\n' +
        this.renderer.renderDraftText(draft)
      )
    }
  }

  private async applyClassificationResult(draft: RecipeDraftEntity, result: TextClassificationResult): Promise<string> {
    if (result.type === 'question' && result.answer) return `🤖 ${result.answer}`

    const patch: Partial<RecipeDraftEntity> = {}
    const lines: string[] = []

    if (result.steps?.length) { patch.steps = [...draft.steps, ...result.steps]; lines.push(`📝 Добавлено ${result.steps.length} шаг(ов)`) }
    if (result.ingredients?.length) { patch.ingredients = [...draft.ingredients, ...result.ingredients]; lines.push(`🥕 Добавлено ${result.ingredients.length} ингредиент(ов)`) }
    if (result.suggestion) {
      const s = result.suggestion
      if (s.cookTimeMinutes && !draft.cookTimeMinutes) { patch.cookTimeMinutes = s.cookTimeMinutes; lines.push(`⏱ Время готовки: ${s.cookTimeMinutes} мин`) }
      if (s.servings && !draft.servings) { patch.servings = s.servings; lines.push(`🍽 Порций: ${s.servings}`) }
      if (s.title && !draft.title) { patch.title = s.title; lines.push(`📌 Название: ${s.title}`) }
      if (s.tags?.length && !draft.tags.length) { patch.tags = s.tags; lines.push(`🏷 Теги: ${s.tags.join(', ')}`) }
    }

    if (!Object.keys(patch).length) return '🤔 Не удалось распознать что именно добавить. Попробуй использовать кнопки меню.'

    const updated = await this.draftService.updateDraft(draft.id, patch)
    return `✅ Обновлено:\n${lines.join('\n')}\n\n${this.renderer.renderDraftText(updated)}`
  }

  private async applyExtractedRecipe(
    draft: RecipeDraftEntity,
    extracted: Awaited<ReturnType<typeof this.assistant.classifyPhoto>> extends { type: 'recipe'; extracted: infer E } ? E : never,
    setStatus?: SetStatus,
  ): Promise<string> {
    await setStatus?.('📖 Извлекаю данные рецепта из фото...')
    const patch: Partial<RecipeDraftEntity> = {}
    const lines = ['📖 ИИ извлёк рецепт из фото:']

    if (extracted.title && !draft.title) { patch.title = extracted.title; lines.push(`• Название: ${extracted.title}`) }
    if (extracted.ingredients.length) { patch.ingredients = [...draft.ingredients, ...extracted.ingredients]; lines.push(`• Ингредиентов: ${extracted.ingredients.length}`) }
    if (extracted.steps.length) {
      patch.steps = [...draft.steps, ...extracted.steps.map((s, i) => ({ order: draft.steps.length + i + 1, text: s.text }))]
      lines.push(`• Шагов: ${extracted.steps.length}`)
    }
    if (extracted.cookTimeMinutes && !draft.cookTimeMinutes) { patch.cookTimeMinutes = extracted.cookTimeMinutes; lines.push(`• Время: ${extracted.cookTimeMinutes} мин`) }
    if (extracted.servings && !draft.servings) { patch.servings = extracted.servings; lines.push(`• Порций: ${extracted.servings}`) }

    if (!Object.keys(patch).length) return '🤔 Не удалось извлечь данные из фото рецепта.'

    await setStatus?.('💾 Сохраняю в черновик...')
    await this.draftService.updateDraft(draft.id, { ...patch, pendingAction: null })
    const updated = await this.draftService.getActiveDraft('telegram', draft.channelChatId, draft.channelUserId)
    return lines.join('\n') + '\n\n' + this.renderer.renderDraftText(updated ?? draft)
  }

  private async buildMissingSuggestion(draft: RecipeDraftEntity): Promise<string> {
    try {
      const suggestions = await this.assistant.suggestMissingFields(draft)
      if (!suggestions.length) return ''
      return `\n\n💡 ИИ может заполнить недостающее:\n${suggestions.map(s => `• ${s.suggestion}`).join('\n')}\n(нажми «Заполнить недостающее»)`
    } catch {
      return ''
    }
  }
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm vitest run tests/unit/bot/handlers/draft.handler.test.ts
```

Ожидаем: 6 тестов, все зелёные.

- [ ] **Step 5: Коммит**

```bash
git add src/modules/bot/handlers/draft.handler.ts \
        tests/unit/bot/handlers/draft.handler.test.ts
git commit -m "feat(bot): add DraftHandler injectable class with tests"
```

---

## Task 6: Перепись `RecipeBot` + регистрация в DI

**Files:**
- Rewrite: `src/modules/bot/recipe-bot.ts`
- Modify: `src/container.ts`

- [ ] **Step 1: Обновить `recipe-bot.ts`**

```typescript
// src/modules/bot/recipe-bot.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken } from './bot.tokens'
import type { IBotAdapter } from './bot-adapter.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IDraftHandler } from './handlers/draft.handler.interface'
import type { IImportHandler } from './handlers/import.handler.interface'
import type { ICallbackHandler } from './handlers/callback.handler.interface'

// IBotAdapter не регистрируется в InversifyJS — создаётся вручную в entrypoint
export class RecipeBot {
  private readonly webUrl = process.env.WEB_URL ?? 'http://localhost:3000'

  constructor(
    private readonly adapter: IBotAdapter,
    @inject(RecipeDraftServiceToken)  private readonly draftService: IRecipeDraftService,
    @inject(DraftHandlerToken)        private readonly draftHandler: IDraftHandler,
    @inject(ImportHandlerToken)       private readonly importHandler: IImportHandler,
    @inject(CallbackHandlerToken)     private readonly callbackHandler: ICallbackHandler,
  ) {}

  register(): this {
    this.adapter.onStart(() => ({
      text:
        'Привет! Я сохраняю рецепты в твою книгу.\n\n' +
        '📝 Пришли текст рецепта — я распознаю его и сохраню.\n' +
        '🔗 Пришли ссылку на рецепт (Instagram, YouTube, кулинарный сайт).\n' +
        '📷 Пришли фото блюда — попробую распознать рецепт из фото.\n\n' +
        'Можно собрать рецепт вручную в интерактивном черновике.\n\n' +
        `Смотреть рецепты: ${this.webUrl}`,
      buttons: [
        [{ text: 'Создать рецепт', data: 'new_recipe' }],
        [{ text: 'Продолжить черновик', data: 'continue_draft' }],
      ],
    }))

    this.adapter.onText(async (text, context, setStatus) => {
      const trimmed = text.trim()
      if (context) {
        const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
        if (draft) return this.draftHandler.handleText(draft, trimmed, setStatus)
      }
      return this.importHandler.handleText(trimmed, setStatus)
    })

    this.adapter.onPhoto(async (buffer, mimeType, caption, context, setStatus) => {
      if (context) {
        const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
        if (draft) return this.draftHandler.handlePhoto(draft, buffer, mimeType, caption, setStatus)
      }
      return this.importHandler.handlePhoto(buffer, mimeType, caption, setStatus)
    })

    this.adapter.onCallback(async (data, context) =>
      this.callbackHandler.handle(data, context)
    )

    return this
  }

  start(): void {
    this.adapter.start()
  }
}
```

- [ ] **Step 2: Обновить `container.ts`**

Добавить в конец файла после существующих биндингов:

```typescript
// добавить импорты в начало файла:
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken, DraftRendererToken } from '@/modules/bot/bot.tokens'
import { DraftHandler } from '@/modules/bot/handlers/draft.handler'
import { ImportHandler } from '@/modules/bot/handlers/import.handler'
import { CallbackHandler } from '@/modules/bot/handlers/callback.handler'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'

// добавить биндинги:
container.bind(DraftRendererToken).to(DraftRenderer).inSingletonScope()
container.bind(ImportHandlerToken).to(ImportHandler).inSingletonScope()
container.bind(CallbackHandlerToken).to(CallbackHandler).inSingletonScope()
container.bind(DraftHandlerToken).to(DraftHandler).inSingletonScope()
```

- [ ] **Step 3: Обновить `scripts/bot.ts`**

```typescript
// scripts/bot.ts
import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken } from '@/modules/bot/bot.tokens'
import { createBotAdapter } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapter = createBotAdapter()
const bot = new RecipeBot(
  adapter,
  container.get(RecipeDraftServiceToken),
  container.get(DraftHandlerToken),
  container.get(ImportHandlerToken),
  container.get(CallbackHandlerToken),
)
bot.register().start()
```

- [ ] **Step 4: Запустить все тесты**

```bash
pnpm vitest run
```

Ожидаем: все тесты зелёные.

- [ ] **Step 5: Коммит**

```bash
git add src/modules/bot/recipe-bot.ts \
        src/container.ts \
        scripts/bot.ts
git commit -m "feat(bot): wire RecipeBot and all handlers into InversifyJS DI"
```

---

## Task 7: Обновить тесты `RecipeBot` + удалить старые файлы

**Files:**
- Rewrite: `tests/unit/bot/recipe-bot.test.ts`
- Delete: `src/modules/bot/draft-text-handler.ts`
- Delete: `src/modules/bot/draft-photo-handler.ts`
- Delete: `src/modules/bot/draft-callbacks.ts`
- Delete: `src/modules/bot/draft-renderer.ts`

- [ ] **Step 1: Обновить `recipe-bot.test.ts`**

Тест `RecipeBot` теперь мокает `IDraftHandler`, `IImportHandler`, `ICallbackHandler` вместо прямых сервисов:

```typescript
// tests/unit/bot/recipe-bot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeBot } from '@/modules/bot/recipe-bot'
import type { IBotAdapter, BotResponse } from '@/modules/bot/bot-adapter.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IDraftHandler } from '@/modules/bot/handlers/draft.handler.interface'
import type { IImportHandler } from '@/modules/bot/handlers/import.handler.interface'
import type { ICallbackHandler } from '@/modules/bot/handlers/callback.handler.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const draft: RecipeDraftEntity = {
  id: 'draft-1',
  channel: 'telegram',
  channelChatId: 'chat-1',
  channelUserId: 'user-1',
  state: 'editing',
  sourceType: 'manual',
  title: null,
  ingredients: [],
  steps: [],
  cookTimeMinutes: null,
  servings: null,
  tags: [],
  sourceText: null,
  sourceUrl: null,
  coverImageKey: null,
  videoUrl: null,
  lastAiSuggestion: null,
  pendingAction: null,
  recipeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(),
}

let capturedTextHandler: ((text: string, context?: { chatId: string; userId: string }) => Promise<string>) | null = null
let capturedPhotoHandler: ((buf: Buffer, mime: string, caption?: string, context?: { chatId: string; userId: string }) => Promise<string>) | null = null
let capturedCallbackHandler: ((data: string, context: { chatId: string; userId: string }) => Promise<BotResponse>) | null = null

const mockAdapter: IBotAdapter = {
  onStart: vi.fn(),
  onText: vi.fn((h) => { capturedTextHandler = h }),
  onPhoto: vi.fn((h) => { capturedPhotoHandler = h }),
  onCallback: vi.fn((h) => { capturedCallbackHandler = h }),
  start: vi.fn(),
}

const mockDraftService: IRecipeDraftService = {
  createDraft: vi.fn(),
  getActiveDraft: vi.fn(),
  updateDraft: vi.fn(),
  attachCoverImage: vi.fn(),
  attachVideoUrl: vi.fn(),
  setEditing: vi.fn(),
  setConfirming: vi.fn(),
  saveDraft: vi.fn(),
  markSaved: vi.fn(),
  discardDraft: vi.fn(),
}

const mockDraftHandler: IDraftHandler = {
  handleText: vi.fn(),
  handlePhoto: vi.fn(),
}

const mockImportHandler: IImportHandler = {
  handleText: vi.fn(),
  handlePhoto: vi.fn(),
}

const mockCallbackHandler: ICallbackHandler = {
  handle: vi.fn(),
}

describe('RecipeBot routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedTextHandler = null
    capturedPhotoHandler = null
    capturedCallbackHandler = null
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(null)
    new RecipeBot(mockAdapter, mockDraftService, mockDraftHandler, mockImportHandler, mockCallbackHandler).register()
  })

  it('текст без черновика → importHandler.handleText', async () => {
    vi.mocked(mockImportHandler.handleText).mockResolvedValue('✅ ok')
    await capturedTextHandler!('Рецепт борща', { chatId: 'chat-1', userId: 'user-1' })
    expect(mockImportHandler.handleText).toHaveBeenCalledWith('Рецепт борща', undefined)
    expect(mockDraftHandler.handleText).not.toHaveBeenCalled()
  })

  it('текст с активным черновиком → draftHandler.handleText', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftHandler.handleText).mockResolvedValue('✅ шаг добавлен')
    await capturedTextHandler!('нарезать лук', { chatId: 'chat-1', userId: 'user-1' })
    expect(mockDraftHandler.handleText).toHaveBeenCalledWith(draft, 'нарезать лук', undefined)
    expect(mockImportHandler.handleText).not.toHaveBeenCalled()
  })

  it('фото без черновика → importHandler.handlePhoto', async () => {
    vi.mocked(mockImportHandler.handlePhoto).mockResolvedValue('✅ ok')
    await capturedPhotoHandler!(Buffer.from(''), 'image/jpeg', undefined, { chatId: 'chat-1', userId: 'user-1' })
    expect(mockImportHandler.handlePhoto).toHaveBeenCalled()
    expect(mockDraftHandler.handlePhoto).not.toHaveBeenCalled()
  })

  it('фото с активным черновиком → draftHandler.handlePhoto', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftHandler.handlePhoto).mockResolvedValue('✅ фото обработано')
    await capturedPhotoHandler!(Buffer.from(''), 'image/jpeg', undefined, { chatId: 'chat-1', userId: 'user-1' })
    expect(mockDraftHandler.handlePhoto).toHaveBeenCalledWith(draft, expect.any(Buffer), 'image/jpeg', undefined, undefined)
  })

  it('callback → callbackHandler.handle', async () => {
    vi.mocked(mockCallbackHandler.handle).mockResolvedValue({ text: 'ok' })
    await capturedCallbackHandler!('new_recipe', { chatId: 'chat-1', userId: 'user-1' })
    expect(mockCallbackHandler.handle).toHaveBeenCalledWith('new_recipe', { chatId: 'chat-1', userId: 'user-1' })
  })

  it('текст без context → importHandler.handleText', async () => {
    vi.mocked(mockImportHandler.handleText).mockResolvedValue('✅ ok')
    await capturedTextHandler!('Рецепт')
    expect(mockImportHandler.handleText).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Запустить тесты**

```bash
pnpm vitest run tests/unit/bot/recipe-bot.test.ts
```

Ожидаем: 6 тестов, все зелёные.

- [ ] **Step 3: Удалить старые файлы**

```bash
rm src/modules/bot/draft-text-handler.ts \
   src/modules/bot/draft-photo-handler.ts \
   src/modules/bot/draft-callbacks.ts \
   src/modules/bot/draft-renderer.ts
```

- [ ] **Step 4: Запустить все тесты — убедиться что всё чисто**

```bash
pnpm vitest run
```

Ожидаем: все тесты зелёные, нет импортов из удалённых файлов.

- [ ] **Step 5: Финальный коммит**

```bash
git add -A
git commit -m "refactor(bot): replace standalone functions with DI handler classes, remove old files"
```
