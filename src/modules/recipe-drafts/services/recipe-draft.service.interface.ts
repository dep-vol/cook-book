import type { RecipeDraftEntity, RecipeDraftSourceType } from '../entities/recipe-draft.entity'

export interface IRecipeDraftService {
  createDraft(input: {
    telegramChatId: string
    telegramUserId: string
    sourceType: RecipeDraftSourceType
  }): Promise<RecipeDraftEntity>
  getActiveDraft(chatId: string, userId: string): Promise<RecipeDraftEntity | null>
  updateDraft(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity>
  attachCoverImage(id: string, imageKey: string): Promise<RecipeDraftEntity>
  attachVideoUrl(id: string, videoUrl: string): Promise<RecipeDraftEntity>
  setEditing(id: string): Promise<RecipeDraftEntity>
  setConfirming(id: string): Promise<RecipeDraftEntity>
  markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity>
  discardDraft(id: string): Promise<void>
}
