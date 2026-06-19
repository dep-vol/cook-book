import { describe, it, expect } from 'vitest'
import { applyOperations } from '@/modules/recipe-drafts/services/draft-refinement.service'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const draft: RecipeDraftEntity = {
  id: 'd', channel: 'telegram', channelChatId: 'c', channelUserId: 'u', state: 'editing',
  sourceType: 'text', title: 'Старое', ingredients: [{ name: 'Соль', amount: '1', unit: 'щ' }],
  steps: [{ order: 1, text: 'A' }, { order: 2, text: 'B' }], cookTimeMinutes: null, servings: null,
  tags: [], sourceText: null, sourceUrl: null, coverImageKey: null, videoUrl: null,
  lastAiSuggestion: null, pendingAction: null, pendingSource: null, recipeId: null,
  createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(),
}

describe('applyOperations', () => {
  it('set_field updates title', () => {
    const p = applyOperations(draft, [{ op: 'set_field', field: 'title', value: 'Новое' }])
    expect(p.title).toBe('Новое')
  })

  it('add_ingredients appends', () => {
    const p = applyOperations(draft, [{ op: 'add_ingredients', items: [{ name: 'Мука', amount: '200', unit: 'г' }] }])
    expect(p.ingredients).toHaveLength(2)
  })

  it('remove_ingredient by index', () => {
    const p = applyOperations(draft, [{ op: 'remove_ingredient', index: 0 }])
    expect(p.ingredients).toHaveLength(0)
  })

  it('remove_step renumbers remaining steps from 1', () => {
    const p = applyOperations(draft, [{ op: 'remove_step', order: 1 }])
    expect(p.steps).toEqual([{ order: 1, text: 'B' }])
  })

  it('add_steps renumbers continuing from existing', () => {
    const p = applyOperations(draft, [{ op: 'add_steps', items: [{ order: 99, text: 'C' }] }])
    expect(p.steps).toEqual([{ order: 1, text: 'A' }, { order: 2, text: 'B' }, { order: 3, text: 'C' }])
  })

  it('set_tags replaces tags', () => {
    const p = applyOperations(draft, [{ op: 'set_tags', tags: ['x', 'y'] }])
    expect(p.tags).toEqual(['x', 'y'])
  })
})
