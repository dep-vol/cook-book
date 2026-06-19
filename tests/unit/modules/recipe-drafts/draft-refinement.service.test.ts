import { describe, it, expect } from 'vitest'
import { applyOperations } from '@/modules/recipe-drafts/services/draft-refinement.service'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const draft: RecipeDraftEntity = {
  id: 'd', channel: 'telegram', channelChatId: 'c', channelUserId: 'u', state: 'editing',
  sourceType: 'text', title: 'Старое', ingredients: [{ name: 'Соль', amount: '1', unit: 'щ' }],
  steps: [{ order: 1, text: 'A' }, { order: 2, text: 'B' }], cookTimeMinutes: null, servings: null,
  tags: [], sourceText: null, sourceUrl: null, coverImageKey: null, videoUrl: null,
  lastAiSuggestion: null, pendingSource: null, recipeId: null,
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

  it('replace_ingredients replaces the whole ingredients array', () => {
    const newItems = [{ name: 'Перец', amount: '5', unit: 'г' }, { name: 'Масло', amount: '2', unit: 'ст.л.' }]
    const p = applyOperations(draft, [{ op: 'replace_ingredients', items: newItems }])
    expect(p.ingredients).toEqual(newItems)
    expect(p.ingredients).toHaveLength(2)
  })

  it('replace_steps replaces the whole steps array and renumbers from 1', () => {
    const newSteps = [{ order: 99, text: 'X' }, { order: 50, text: 'Y' }]
    const p = applyOperations(draft, [{ op: 'replace_steps', items: newSteps }])
    expect(p.steps).toEqual([{ order: 1, text: 'X' }, { order: 2, text: 'Y' }])
  })

  it('set_field sets cookTimeMinutes as a number', () => {
    const p = applyOperations(draft, [{ op: 'set_field', field: 'cookTimeMinutes', value: 45 }])
    expect(p.cookTimeMinutes).toBe(45)
    expect(typeof p.cookTimeMinutes).toBe('number')
  })

  it('set_field sets servings as a number', () => {
    const p = applyOperations(draft, [{ op: 'set_field', field: 'servings', value: 6 }])
    expect(p.servings).toBe(6)
    expect(typeof p.servings).toBe('number')
  })

  it('set_field sets numeric field to null when value is null', () => {
    const draftWithTime = { ...draft, cookTimeMinutes: 30 }
    const p = applyOperations(draftWithTime, [{ op: 'set_field', field: 'cookTimeMinutes', value: null }])
    expect(p.cookTimeMinutes).toBeNull()
  })
})
