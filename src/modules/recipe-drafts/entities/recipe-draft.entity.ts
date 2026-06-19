export type RecipeDraftState = 'editing' | 'confirming' | 'saved' | 'expired'
export type RecipeDraftSourceType = 'manual' | 'text' | 'photo' | 'url'
export type DraftPendingAction =
  | 'waiting_for_step'
  | 'waiting_for_ingredient'
  | 'waiting_for_photo'
  | 'waiting_for_video'

export interface RecipeDraftEntity {
  id: string
  channel: string
  channelChatId: string
  channelUserId: string
  state: RecipeDraftState
  sourceType: RecipeDraftSourceType
  title: string | null
  ingredients: Array<{ name: string; amount: string; unit: string }>
  steps: Array<{ order: number; text: string }>
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
  sourceText: string | null
  sourceUrl: string | null
  coverImageKey: string | null
  videoUrl: string | null
  lastAiSuggestion: unknown | null
  pendingAction: DraftPendingAction | null
  recipeId: string | null
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}
