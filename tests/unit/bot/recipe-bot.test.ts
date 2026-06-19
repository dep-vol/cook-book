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

let capturedTextHandler: ((text: string, context?: { channel: string; chatId: string; userId: string }) => Promise<string>) | null = null
let capturedPhotoHandler: ((buf: Buffer, mime: string, caption?: string, context?: { channel: string; chatId: string; userId: string }) => Promise<string>) | null = null
let capturedCallbackHandler: ((data: string, context: { channel: string; chatId: string; userId: string }) => Promise<BotResponse>) | null = null

const mockAdapter: IBotAdapter = {
  channel: 'telegram',
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
    await capturedTextHandler!('Рецепт борща', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockImportHandler.handleText).toHaveBeenCalledWith('Рецепт борща', undefined)
    expect(mockDraftHandler.handleText).not.toHaveBeenCalled()
  })

  it('текст с активным черновиком → draftHandler.handleText', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftHandler.handleText).mockResolvedValue('✅ шаг добавлен')
    await capturedTextHandler!('нарезать лук', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockDraftHandler.handleText).toHaveBeenCalledWith(draft, 'нарезать лук', undefined)
    expect(mockImportHandler.handleText).not.toHaveBeenCalled()
  })

  it('фото без черновика → importHandler.handlePhoto', async () => {
    vi.mocked(mockImportHandler.handlePhoto).mockResolvedValue('✅ ok')
    await capturedPhotoHandler!(Buffer.from(''), 'image/jpeg', undefined, { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockImportHandler.handlePhoto).toHaveBeenCalled()
    expect(mockDraftHandler.handlePhoto).not.toHaveBeenCalled()
  })

  it('фото с активным черновиком → draftHandler.handlePhoto', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftHandler.handlePhoto).mockResolvedValue('✅ фото обработано')
    await capturedPhotoHandler!(Buffer.from(''), 'image/jpeg', undefined, { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockDraftHandler.handlePhoto).toHaveBeenCalledWith(draft, expect.any(Buffer), 'image/jpeg', undefined, undefined)
  })

  it('callback → callbackHandler.handle', async () => {
    vi.mocked(mockCallbackHandler.handle).mockResolvedValue({ text: 'ok' })
    await capturedCallbackHandler!('new_recipe', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockCallbackHandler.handle).toHaveBeenCalledWith('new_recipe', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
  })

  it('текст без context → importHandler.handleText', async () => {
    vi.mocked(mockImportHandler.handleText).mockResolvedValue('✅ ok')
    await capturedTextHandler!('Рецепт')
    expect(mockImportHandler.handleText).toHaveBeenCalled()
  })
})
