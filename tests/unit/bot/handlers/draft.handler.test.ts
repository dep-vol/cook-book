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
