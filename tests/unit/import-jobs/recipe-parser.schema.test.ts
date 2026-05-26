import { describe, it, expect } from 'vitest'
import { ParsedRecipeSchema, extractJson } from '@/lib/deepseek'

describe('ParsedRecipeSchema', () => {
  it('validates a correctly structured recipe from LLM', () => {
    const input = {
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу кубиками' }],
      cookTimeMinutes: 90,
      servings: 4,
      tags: ['суп', 'украинская кухня'],
    }
    const result = ParsedRecipeSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('defaults missing cookTimeMinutes, servings, tags to null / []', () => {
    const input = {
      title: 'Яичница',
      ingredients: [{ name: 'Яйцо', amount: '2', unit: 'шт' }],
      steps: [{ order: 1, text: 'Разбить яйца на сковороду' }],
    }
    const result = ParsedRecipeSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cookTimeMinutes).toBeNull()
      expect(result.data.servings).toBeNull()
      expect(result.data.tags).toEqual([])
    }
  })

  it('rejects recipe with empty title', () => {
    const input = {
      title: '',
      ingredients: [{ name: 'Яйцо', amount: '2', unit: 'шт' }],
      steps: [{ order: 1, text: 'Разбить яйца' }],
    }
    expect(ParsedRecipeSchema.safeParse(input).success).toBe(false)
  })
})

describe('extractJson', () => {
  it('parses plain JSON string', () => {
    const result = extractJson('{"title":"Борщ"}')
    expect(result).toEqual({ title: 'Борщ' })
  })

  it('extracts JSON from markdown code block with json tag', () => {
    const text = '```json\n{"title":"Борщ"}\n```'
    expect(extractJson(text)).toEqual({ title: 'Борщ' })
  })

  it('extracts JSON from code block without language tag', () => {
    const text = '```\n{"title":"Борщ"}\n```'
    expect(extractJson(text)).toEqual({ title: 'Борщ' })
  })
})
