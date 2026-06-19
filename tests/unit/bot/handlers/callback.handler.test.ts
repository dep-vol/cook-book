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
