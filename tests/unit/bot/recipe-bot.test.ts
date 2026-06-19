// tests/unit/bot/recipe-bot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeBot } from '@/modules/bot/recipe-bot'
import type { IBotAdapter, BotResponse } from '@/modules/bot/bot-adapter.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { IDraftHandler } from '@/modules/bot/handlers/draft.handler.interface'
import type { ICallbackHandler } from '@/modules/bot/handlers/callback.handler.interface'
import type { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
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
  pendingSource: null,
  recipeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(),
}

let capturedTextHandler: ((text: string, context?: { channel: string; chatId: string; userId: string }) => Promise<BotResponse>) | null = null
let capturedPhotoHandler: ((buf: Buffer, mime: string, caption: string | undefined, context?: { channel: string; chatId: string; userId: string }) => Promise<BotResponse>) | null = null
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

const mockRecognition: IRecognitionService = {
  recognize: vi.fn(),
  toContent: vi.fn(),
  createDraftFromContent: vi.fn(),
  mergeContentIntoDraft: vi.fn(),
}

const mockDraftHandler: IDraftHandler = {
  handleText: vi.fn(),
  handlePhoto: vi.fn(),
}

const mockCallbackHandler: ICallbackHandler = {
  handle: vi.fn(),
}

const mockRenderer = {
  renderDraft: vi.fn().mockReturnValue({ text: 'Черновик', buttons: [] }),
  renderDraftText: vi.fn().mockReturnValue('Черновик текст'),
  renderDraftMenuButtons: vi.fn().mockReturnValue([]),
  renderSourceDecisionButtons: vi.fn().mockReturnValue([]),
  renderUnknownCallback: vi.fn().mockReturnValue({ text: 'unknown' }),
} as unknown as DraftRenderer

describe('RecipeBot routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedTextHandler = null
    capturedPhotoHandler = null
    capturedCallbackHandler = null
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(null)
    new RecipeBot(mockAdapter, mockDraftService, mockRecognition, mockDraftHandler, mockCallbackHandler, mockRenderer).register()
  })

  it('текст без черновика → recognition.recognize called, returns BotResponse', async () => {
    vi.mocked(mockRecognition.recognize).mockResolvedValue(draft)
    const result = await capturedTextHandler!('Рецепт борща', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockRecognition.recognize).toHaveBeenCalled()
    expect(mockDraftHandler.handleText).not.toHaveBeenCalled()
    expect(result).toHaveProperty('text')
  })

  it('текст с активным черновиком → draftHandler.handleText', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    const draftResponse: BotResponse = { text: '✅ шаг добавлен', buttons: [] }
    vi.mocked(mockDraftHandler.handleText).mockResolvedValue(draftResponse)
    const result = await capturedTextHandler!('нарезать лук', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockDraftHandler.handleText).toHaveBeenCalledWith(draft, 'нарезать лук', undefined)
    expect(mockDraftService.getActiveDraft).toHaveBeenCalledWith('telegram', 'chat-1', 'user-1')
    expect(mockRecognition.recognize).not.toHaveBeenCalled()
    expect(result).toBe(draftResponse)
  })

  it('текст без context → возвращает BotResponse с ошибкой', async () => {
    const result = await capturedTextHandler!('Рецепт')
    expect(result).toEqual({ text: 'Не удалось определить чат.' })
    expect(mockRecognition.recognize).not.toHaveBeenCalled()
  })

  it('фото без черновика → recognition.recognize called', async () => {
    vi.mocked(mockRecognition.recognize).mockResolvedValue(draft)
    const result = await capturedPhotoHandler!(Buffer.from(''), 'image/jpeg', undefined, { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockRecognition.recognize).toHaveBeenCalled()
    expect(mockDraftHandler.handlePhoto).not.toHaveBeenCalled()
    expect(result).toHaveProperty('text')
  })

  it('фото с активным черновиком → draftHandler.handlePhoto', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    const draftResponse: BotResponse = { text: '✅ фото обработано', buttons: [] }
    vi.mocked(mockDraftHandler.handlePhoto).mockResolvedValue(draftResponse)
    const result = await capturedPhotoHandler!(Buffer.from(''), 'image/jpeg', undefined, { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockDraftHandler.handlePhoto).toHaveBeenCalledWith(draft, expect.any(Buffer), 'image/jpeg', undefined, undefined)
    expect(mockDraftService.getActiveDraft).toHaveBeenCalledWith('telegram', 'chat-1', 'user-1')
    expect(result).toBe(draftResponse)
  })

  it('фото без context → возвращает BotResponse с ошибкой', async () => {
    const result = await capturedPhotoHandler!(Buffer.from(''), 'image/jpeg', undefined)
    expect(result).toEqual({ text: 'Не удалось определить чат.' })
    expect(mockRecognition.recognize).not.toHaveBeenCalled()
  })

  it('callback → callbackHandler.handle', async () => {
    vi.mocked(mockCallbackHandler.handle).mockResolvedValue({ text: 'ok' })
    await capturedCallbackHandler!('draft:save:draft-1', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
    expect(mockCallbackHandler.handle).toHaveBeenCalledWith('draft:save:draft-1', { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' })
  })
})
