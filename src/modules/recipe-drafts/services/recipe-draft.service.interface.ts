import type { RecipeDraftEntity, RecipeDraftSourceType } from '../entities/recipe-draft.entity'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'

export interface IRecipeDraftService {
  createDraft(input: {
    channel: string
    channelChatId: string
    channelUserId: string
    sourceType: RecipeDraftSourceType
  }): Promise<RecipeDraftEntity>
  getActiveDraft(channel: string, chatId: string, userId: string): Promise<RecipeDraftEntity | null>
  updateDraft(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity>
  attachCoverImage(id: string, imageKey: string): Promise<RecipeDraftEntity>
  attachVideoUrl(id: string, videoUrl: string): Promise<RecipeDraftEntity>
  setEditing(id: string): Promise<RecipeDraftEntity>
  setConfirming(id: string): Promise<RecipeDraftEntity>
  saveDraft(id: string): Promise<RecipeEntity>
  markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity>
  discardDraft(id: string): Promise<void>
}
