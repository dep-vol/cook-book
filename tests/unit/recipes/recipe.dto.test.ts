import { describe, it, expect } from 'vitest'
import { CreateRecipeSchema } from '@/modules/recipes/transport/recipe.dto'

describe('CreateRecipeSchema', () => {
  it('validates a correct recipe', () => {
    const input = {
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу' }],
      cookTimeMinutes: 90,
      servings: 4,
      tags: ['суп', 'украинская кухня'],
      sourceUrl: null,
    }
    const result = CreateRecipeSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts videoUrl', () => {
    const result = CreateRecipeSchema.parse({
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу' }],
      cookTimeMinutes: 90,
      servings: 4,
      tags: ['суп'],
      sourceUrl: null,
      imageKey: null,
      videoUrl: 'https://example.com/video.mp4',
    })

    expect(result.videoUrl).toBe('https://example.com/video.mp4')
  })

  it('rejects videoUrl when it is not an http or https URL', () => {
    const baseRecipe = {
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу' }],
      cookTimeMinutes: 90,
      servings: 4,
      tags: ['суп'],
      sourceUrl: null,
      imageKey: null,
    }

    const invalidUrlResult = CreateRecipeSchema.safeParse({
      ...baseRecipe,
      videoUrl: 'not-a-url',
    })
    const unsupportedProtocolResult = CreateRecipeSchema.safeParse({
      ...baseRecipe,
      videoUrl: 'ftp://example.com/video.mp4',
    })

    expect(invalidUrlResult.success).toBe(false)
    expect(unsupportedProtocolResult.success).toBe(false)
    if (!invalidUrlResult.success) {
      expect(invalidUrlResult.error.issues[0].path).toContain('videoUrl')
    }
  })

  it('rejects a recipe with empty title', () => {
    const input = {
      title: '',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать' }],
      cookTimeMinutes: null,
      servings: null,
      tags: [],
    }
    const result = CreateRecipeSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title')
    }
  })

  it('rejects a recipe with no ingredients', () => {
    const input = {
      title: 'Борщ',
      ingredients: [],
      steps: [{ order: 1, text: 'Нарезать' }],
      cookTimeMinutes: null,
      servings: null,
      tags: [],
    }
    const result = CreateRecipeSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
