// tests/unit/bot/handlers/draft.handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftHandler } from '@/modules/bot/handlers/draft.handler'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const baseDraft: RecipeDraftEntity = {
  id: 'd1',
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

const drafts = { updateDraft: vi.fn().mockResolvedValue(baseDraft) } as any
const refinement = { refine: vi.fn().mockResolvedValue({ draft: baseDraft, summary: 'обновил название' }) } as any
const recognition = { toContent: vi.fn().mockResolvedValue({ text: 'x' }) } as any

describe('DraftHandler', () => {
  beforeEach(() => vi.clearAllMocks())
  const h = () => new DraftHandler(drafts, refinement, recognition, new DraftRenderer())

  it('plain text → refine called and returns draft-menu buttons', async () => {
    const out = await h().handleText(baseDraft, 'назови Борщ')
    expect(refinement.refine).toHaveBeenCalledWith(baseDraft, { text: 'назови Борщ' })
    expect(out.text).toContain('обновил название')
    expect(out.buttons?.flat().map(b => b.data)).toContain('draft:save:d1')
    expect(out.buttons?.flat().map(b => b.data)).toContain('draft:discard:d1')
  })

  it('plain text with answer → shows answer text', async () => {
    vi.mocked(refinement.refine).mockResolvedValue({ draft: baseDraft, summary: 'ignored', answer: 'Ответ ИИ' })
    const out = await h().handleText(baseDraft, 'сколько варить?')
    expect(out.text).toContain('🤖 Ответ ИИ')
    expect(out.buttons?.flat().map(b => b.data)).toContain('draft:save:d1')
  })

  it('url → stashes pendingSource and asks for decision', async () => {
    const out = await h().handleText(baseDraft, 'https://eda.ru/1')
    expect(recognition.toContent).toHaveBeenCalledWith({ kind: 'url', url: 'https://eda.ru/1' })
    expect(drafts.updateDraft).toHaveBeenCalledWith('d1', { pendingSource: { text: 'x' } })
    expect(out.text).toContain('текущему черновику')
    expect(out.buttons?.flat().map(b => b.data)).toContain('draft:merge:d1')
    expect(out.buttons?.flat().map(b => b.data)).toContain('draft:newfrom:d1')
  })

  it('photo → stashes pendingSource and asks for decision', async () => {
    const out = await h().handlePhoto(baseDraft, Buffer.from('a'), 'image/png', undefined)
    expect(recognition.toContent).toHaveBeenCalled()
    expect(drafts.updateDraft).toHaveBeenCalledWith('d1', expect.objectContaining({ pendingSource: expect.anything() }))
    expect(out.text).toContain('текущему черновику')
    expect(out.buttons?.flat().map(b => b.data)).toContain('draft:merge:d1')
    expect(out.buttons?.flat().map(b => b.data)).toContain('draft:newfrom:d1')
  })

  it('non-url text → refinement called, not recognition.toContent', async () => {
    await h().handleText(baseDraft, 'обычный текст без ссылки')
    expect(refinement.refine).toHaveBeenCalled()
    expect(recognition.toContent).not.toHaveBeenCalled()
  })
})
