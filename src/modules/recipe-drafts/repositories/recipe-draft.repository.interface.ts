import type { RecipeDraftEntity, RecipeDraftSourceType } from '../entities/recipe-draft.entity'

export interface IRecipeDraftRepository {
  create(data: {
    channel: string
    channelChatId: string
    channelUserId: string
    sourceType: RecipeDraftSourceType
  }): Promise<RecipeDraftEntity>
  findById(id: string): Promise<RecipeDraftEntity | null>
  findActiveDraft(channel: string, chatId: string, userId: string): Promise<RecipeDraftEntity | null>
  update(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity>
  markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity>
  delete(id: string): Promise<void>
}
