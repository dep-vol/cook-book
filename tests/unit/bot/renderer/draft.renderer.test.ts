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
  pendingSource: null,
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
    expect(resp.buttons?.flat().map(b => b.data)).toContain(`draft:discard:draft-1`)
  })

  it('renderDraftMenuButtons содержит 2 кнопки (Опубликовать и Удалить)', () => {
    const buttons = renderer.renderDraftMenuButtons('draft-1')
    expect(buttons).toHaveLength(2)
    const flatData = buttons!.flat().map(b => b.data)
    expect(flatData).toContain('draft:save:draft-1')
    expect(flatData).toContain('draft:discard:draft-1')
  })

  it('renderSourceDecisionButtons содержит кнопки merge и newfrom', () => {
    const buttons = renderer.renderSourceDecisionButtons('draft-1')
    expect(buttons).toHaveLength(2)
    const flatData = buttons!.flat().map(b => b.data)
    expect(flatData).toContain('draft:merge:draft-1')
    expect(flatData).toContain('draft:newfrom:draft-1')
  })

  it('renderUnknownCallback возвращает BotResponse без кнопок', () => {
    const resp = renderer.renderUnknownCallback()
    expect(resp.text).toContain('Не понял действие')
    expect(resp.buttons).toBeUndefined()
  })
})
