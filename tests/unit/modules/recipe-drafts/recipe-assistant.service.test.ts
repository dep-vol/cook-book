import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service'

const openaiMocks = vi.hoisted(() => {
  const create = vi.fn()
  const ctor = vi.fn(() => ({
    chat: {
      completions: {
        create,
      },
    },
  }))
  return { create, ctor }
})

vi.mock('openai', () => ({
  default: openaiMocks.ctor,
}))

const llmService = {
  getTextGenerationUrl: () => 'https://text.example.com',
  getTextGenerationApiKey: () => 'text-key',
  getTextGenerationModel: () => 'text-model',
  getImgGenerationUrl: () => 'https://img.example.com',
  getImgGenerationApiKey: () => 'img-key',
  getImgGenerationModel: () => 'img-model',
}

describe('RecipeAssistantService', () => {
  let service: RecipeAssistantService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RecipeAssistantService(llmService as never)
  })

  it('suggestFromText accepts valid JSON', async () => {
    openaiMocks.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Борщ',
              ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
              steps: [{ order: 1, text: 'Нарезать свёклу' }],
              cookTimeMinutes: 90,
              servings: 4,
              tags: ['суп'],
            }),
          },
        },
      ],
    })

    const result = await service.suggestFromText('Рецепт борща')

    expect(result.title).toBe('Борщ')
    expect(result.ingredients).toHaveLength(1)
    expect(openaiMocks.create).toHaveBeenCalled()
  })

  it('suggestFromText rejects malformed JSON', async () => {
    openaiMocks.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'not json',
          },
        },
      ],
    })

    await expect(service.suggestFromText('Рецепт борща')).rejects.toThrow('Invalid AI response format')
  })
})
