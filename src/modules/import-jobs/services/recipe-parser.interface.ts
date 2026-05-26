export interface ParsedRecipe {
  title: string
  ingredients: Array<{ name: string; amount: string; unit: string }>
  steps: Array<{ order: number; text: string }>
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
}

export interface IRecipeParser {
  parseText(text: string): Promise<ParsedRecipe>
  parsePhoto(base64: string, mimeType: string): Promise<ParsedRecipe>
}
