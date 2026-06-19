import type { NormalizedContent } from '../sources/source.interface'

export interface ExtractedRecipe {
  title: string | null
  ingredients: Array<{ name: string; amount: string; unit: string }>
  steps: Array<{ order: number; text: string }>
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
}

export interface IRecipeExtractor {
  extract(content: NormalizedContent): Promise<ExtractedRecipe>
}
