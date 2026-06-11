export interface DraftSuggestion {
  title: string
  ingredients: Array<{ name: string; amount: string; unit: string }>
  steps: Array<{ order: number; text: string }>
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
}

export interface IRecipeAssistantService {
  suggestFromText(input: string): Promise<DraftSuggestion>
  suggestFromPhoto(base64: string, mimeType: string, caption?: string): Promise<DraftSuggestion>
}
