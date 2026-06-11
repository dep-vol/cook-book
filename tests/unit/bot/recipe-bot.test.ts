import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeBot } from '@/modules/bot/recipe-bot'
import type { IBotAdapter } from '@/modules/bot/bot-adapter.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { ImportJobEntity } from '@/modules/import-jobs/entities/import-job.entity'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

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
let capturedCallbackHandler: ((data: string, context: { chatId: string; userId: string }) => Promise<{ text: string; buttons?: { text: string; data: string }[][] }>) | null = null

const mockAdapter: IBotAdapter = {
  onStart: vi.fn(),
  onText: vi.fn((handler) => { capturedTextHandler = handler }),
  onPhoto: vi.fn(),
  onCallback: vi.fn((handler) => { capturedCallbackHandler = handler }),
  start: vi.fn(),
}

const mockService: IImportJobService = {
  importFromText: vi.fn(),
  importFromPhoto: vi.fn(),
  importFromTextWithPhoto: vi.fn(),
  importFromUrl: vi.fn(),
  importFromTextWithPhoto: vi.fn(),
}

const draft: RecipeDraftEntity = {
  id: 'draft-1',
  telegramChatId: 'chat-1',
  telegramUserId: 'user-1',
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
  markSaved: vi.fn(),
  discardDraft: vi.fn(),
}

describe('RecipeBot URL detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedTextHandler = null
    capturedCallbackHandler = null
    const bot = new RecipeBot(mockAdapter, mockService, mockDraftService)
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

  it('creates a manual draft from new_recipe callback and returns draft menu buttons', async () => {
    vi.mocked(mockDraftService.createDraft).mockResolvedValue(draft)

    const reply = await capturedCallbackHandler!('new_recipe', { chatId: 'chat-1', userId: 'user-1' })

    expect(mockDraftService.createDraft).toHaveBeenCalledWith({
      telegramChatId: 'chat-1',
      telegramUserId: 'user-1',
      sourceType: 'manual',
    })
    expect(reply.text).toContain('Черновик')
    expect(reply.buttons?.flat()).toEqual(expect.arrayContaining([
      { text: 'Добавить ингредиент', data: 'draft:add_ingredient:draft-1' },
      { text: 'Сохранить', data: 'draft:save:draft-1' },
    ]))
  })

  it('asks for an ingredient and keeps the draft menu for ingredient callback', async () => {
    const reply = await capturedCallbackHandler!('draft:add_ingredient:draft-1', { chatId: 'chat-1', userId: 'user-1' })

    expect(reply.text).toContain('ингредиент')
    expect(reply.buttons?.flat()).toEqual(expect.arrayContaining([
      { text: 'Добавить шаг', data: 'draft:add_step:draft-1' },
      { text: 'Спросить ИИ', data: 'draft:ask_ai:draft-1' },
    ]))
  })
})
