import { describe, it, expect } from 'vitest'
import { CreateRecipeSchema } from '@/modules/recipes/transport/recipe.dto'

describe('CreateRecipeSchema', () => {
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
})
