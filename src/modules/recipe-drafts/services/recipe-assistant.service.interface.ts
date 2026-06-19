import type { RecipeDraftEntity } from '../entities/recipe-draft.entity'

export interface DraftSuggestion {
  title: string
  ingredients: Array<{ name: string; amount: string; unit: string }>
  steps: Array<{ order: number; text: string }>
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
}

export type PhotoClassification =
  | { type: 'cover' }
  | { type: 'step'; stepOrder: number }
  | { type: 'recipe'; extracted: DraftSuggestion }

export interface TextClassificationResult {
  type: 'steps' | 'ingredients' | 'question' | 'mixed'
  steps?: Array<{ order: number; text: string }>
  ingredients?: Array<{ name: string; amount: string; unit: string }>
  answer?: string
  suggestion?: Partial<DraftSuggestion>
}

export interface MissingFieldSuggestion {
  field: 'cookTimeMinutes' | 'servings' | 'tags' | 'title'
  suggestion: string
  value: number | string | string[]
}

export interface IRecipeAssistantService {
  suggestFromText(input: string): Promise<DraftSuggestion>
  suggestFromPhoto(base64: string, mimeType: string, caption?: string): Promise<DraftSuggestion>
  /** Нормализует шаги из свободного текста (один или несколько, разбивает) */
  normalizeSteps(text: string, existingCount: number): Promise<Array<{ order: number; text: string }>>
  /** Нормализует ингредиент из свободного текста */
  normalizeIngredient(text: string): Promise<{ name: string; amount: string; unit: string }>
  /** Классифицирует произвольный текст при отсутствии pendingAction */
  classifyText(text: string, draft: RecipeDraftEntity): Promise<TextClassificationResult>
  /** Классифицирует фото: обложка, фото шага, или текст рецепта */
  classifyPhoto(base64: string, mimeType: string, draft: RecipeDraftEntity, caption?: string): Promise<PhotoClassification>
  /** Предлагает заполнить отсутствующие поля */
  suggestMissingFields(draft: RecipeDraftEntity): Promise<MissingFieldSuggestion[]>
}
