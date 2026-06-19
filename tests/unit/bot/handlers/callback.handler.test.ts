// tests/unit/bot/handlers/callback.handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CallbackHandler } from '@/modules/bot/handlers/callback.handler'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { NormalizedContent } from '@/modules/recognition/sources/source.interface'

const ctx = { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' }

const pendingSource: NormalizedContent = { text: 'some content', sourceUrl: 'https://eda.ru/1' }

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
  pendingSource: null,
  recipeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(),
}

const draftWithPending: RecipeDraftEntity = { ...draft, pendingSource }

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

describe('CallbackHandler', () => {
  let handler: CallbackHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new CallbackHandler(mockDraftService, mockRecognition, new DraftRenderer())
  })

  it('unknown scope → renderUnknownCallback', async () => {
    const resp = await handler.handle('unknown:action:id', ctx)
    expect(resp.text).toContain('Не понял действие')
  })

  it('draft not found → renderUnknownCallback', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(null)
    const resp = await handler.handle('draft:save:draft-1', ctx)
    expect(resp.text).toContain('Не понял действие')
  })

  it('draft id mismatch → renderUnknownCallback', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue({ ...draft, id: 'other-id' })
    const resp = await handler.handle('draft:save:draft-1', ctx)
    expect(resp.text).toContain('Не понял действие')
  })

  it('merge → mergeContentIntoDraft called, clears pendingSource', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draftWithPending)
    const mergedDraft = { ...draftWithPending, title: 'Борщ' }
    vi.mocked(mockRecognition.mergeContentIntoDraft).mockResolvedValue({ draft: mergedDraft, summary: 'Добавил название Борщ' })
    vi.mocked(mockDraftService.updateDraft).mockResolvedValue({ ...mergedDraft, pendingSource: null })

    const resp = await handler.handle('draft:merge:draft-1', ctx)
    expect(mockRecognition.mergeContentIntoDraft).toHaveBeenCalledWith(draftWithPending, pendingSource)
    expect(mockDraftService.updateDraft).toHaveBeenCalledWith('draft-1', { pendingSource: null })
    expect(resp.text).toContain('✅ Добавил название Борщ')
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:save:draft-1')
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:discard:draft-1')
  })

  it('merge without pendingSource → error message', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft) // no pendingSource
    const resp = await handler.handle('draft:merge:draft-1', ctx)
    expect(resp.text).toContain('Источник не найден')
  })

  it('newfrom → discardDraft + createDraftFromContent', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draftWithPending)
    const newDraft = { ...draft, id: 'new-draft', title: 'Новый' }
    vi.mocked(mockRecognition.createDraftFromContent).mockResolvedValue(newDraft)
    vi.mocked(mockDraftService.discardDraft).mockResolvedValue(undefined)

    const resp = await handler.handle('draft:newfrom:draft-1', ctx)
    expect(mockDraftService.discardDraft).toHaveBeenCalledWith('draft-1')
    expect(mockRecognition.createDraftFromContent).toHaveBeenCalledWith(
      pendingSource,
      'url',
      { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' },
    )
    expect(resp.text).toContain('Черновик')
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:save:new-draft')
  })

  it('save → setConfirming + confirmation buttons', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftService.setConfirming).mockResolvedValue({ ...draft, state: 'confirming' })

    const resp = await handler.handle('draft:save:draft-1', ctx)
    expect(mockDraftService.setConfirming).toHaveBeenCalledWith('draft-1')
    expect(resp.text).toContain('Опубликовать черновик')
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:confirm_save:draft-1')
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:back:draft-1')
  })

  it('confirm_save → saveDraft and returns links', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftService.saveDraft).mockResolvedValue({ id: 'recipe-1' } as any)

    const resp = await handler.handle('draft:confirm_save:draft-1', ctx)
    expect(mockDraftService.saveDraft).toHaveBeenCalledWith('draft-1')
    expect(resp.text).toContain('✅ Опубликовано')
    expect(resp.text).toContain('/recipes/recipe-1')
    expect(resp.text).toContain('/admin/recipes/recipe-1/edit')
  })

  it('back → setEditing + returns draft', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftService.setEditing).mockResolvedValue(draft)

    const resp = await handler.handle('draft:back:draft-1', ctx)
    expect(mockDraftService.setEditing).toHaveBeenCalledWith('draft-1')
    expect(resp.text).toContain('Черновик')
    expect(resp.buttons?.flat().map(b => b.data)).toContain('draft:save:draft-1')
  })

  it('discard → discardDraft + message', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    vi.mocked(mockDraftService.discardDraft).mockResolvedValue(undefined)

    const resp = await handler.handle('draft:discard:draft-1', ctx)
    expect(mockDraftService.discardDraft).toHaveBeenCalledWith('draft-1')
    expect(resp.text).toContain('Черновик удалён')
  })

  it('unknown action → renderUnknownCallback', async () => {
    vi.mocked(mockDraftService.getActiveDraft).mockResolvedValue(draft)
    const resp = await handler.handle('draft:unknown_action:draft-1', ctx)
    expect(resp.text).toContain('Не понял действие')
  })
})
