import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: createMock } } },
}))

import { RecipeExtractor } from '@/modules/recognition/extractor/recipe-extractor'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'

const llm = {
  getLlmBaseUrl: () => 'https://openrouter.ai/api/v1',
  getLlmApiKey: () => 'sk',
  getRecognitionModel: () => 'google/gemini-3.1-flash-lite',
} as unknown as ILLMService

function reply(content: string) {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content } }] })
}

describe('RecipeExtractor', () => {
  beforeEach(() => createMock.mockReset())

  it('parses a full recipe JSON', async () => {
    reply(JSON.stringify({
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать' }],
      cookTimeMinutes: 90, servings: 4, tags: ['суп'],
    }))
    const out = await new RecipeExtractor(llm).extract({ text: 'борщ ...' })
    expect(out.title).toBe('Борщ')
    expect(out.ingredients).toHaveLength(1)
    expect(out.steps[0].order).toBe(1)
  })

  it('accepts a partial result (null title, empty arrays)', async () => {
    reply(JSON.stringify({ title: null, ingredients: [], steps: [], cookTimeMinutes: null, servings: null, tags: [] }))
    const out = await new RecipeExtractor(llm).extract({ text: 'непонятно' })
    expect(out.title).toBeNull()
    expect(out.ingredients).toEqual([])
    expect(out.steps).toEqual([])
  })

  it('sends image content parts when images are present', async () => {
    reply(JSON.stringify({ title: 'X', ingredients: [], steps: [], cookTimeMinutes: null, servings: null, tags: [] }))
    await new RecipeExtractor(llm).extract({ images: [{ base64: 'AAAA', mimeType: 'image/png' }] })
    const sent = createMock.mock.calls[0][0]
    const userMsg = sent.messages.find((m: { role: string }) => m.role === 'user')
    const hasImage = JSON.stringify(userMsg.content).includes('data:image/png;base64,AAAA')
    expect(hasImage).toBe(true)
  })

  it('throws on empty LLM response', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
    await expect(new RecipeExtractor(llm).extract({ text: 'x' })).rejects.toThrow()
  })

  it('instructs the model to never infer ingredients/steps that are not literally present', async () => {
    reply(JSON.stringify({ title: null, ingredients: [], steps: [], cookTimeMinutes: null, servings: null, tags: [] }))
    await new RecipeExtractor(llm).extract({ text: 'x' })
    const sent = createMock.mock.calls[0][0]
    const systemMsg = sent.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMsg.content).not.toMatch(/not implied by the input/)
    expect(systemMsg.content).toMatch(/not (?:literally |explicitly )?present in the input/)
  })
})
