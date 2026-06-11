import { inject, injectable } from 'inversify'
import { RecipeDraftRepositoryToken } from '@/tokens/recipe-draft.tokens'
import type { IRecipeDraftRepository } from '../repositories/recipe-draft.repository.interface'
import type { IRecipeDraftService } from './recipe-draft.service.interface'
import type { RecipeDraftEntity, RecipeDraftSourceType } from '../entities/recipe-draft.entity'

@injectable()
export class RecipeDraftService implements IRecipeDraftService {
  constructor(
    @inject(RecipeDraftRepositoryToken) private readonly repo: IRecipeDraftRepository
  ) {}

  async createDraft(input: {
    telegramChatId: string
    telegramUserId: string
    sourceType: RecipeDraftSourceType
  }): Promise<RecipeDraftEntity> {
    return this.repo.create(input)
  }

  async getActiveDraft(chatId: string, userId: string): Promise<RecipeDraftEntity | null> {
    return this.repo.findByChatAndActive(chatId, userId)
  }

  async updateDraft(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity> {
    return this.repo.update(id, patch)
  }

  async attachCoverImage(id: string, imageKey: string): Promise<RecipeDraftEntity> {
    return this.repo.update(id, { coverImageKey: imageKey })
  }

  async attachVideoUrl(id: string, videoUrl: string): Promise<RecipeDraftEntity> {
    if (!this.isHttpUrl(videoUrl)) {
      throw new Error('Video URL must use http or https')
    }
    return this.repo.update(id, { videoUrl })
  }

  async setEditing(id: string): Promise<RecipeDraftEntity> {
    return this.repo.update(id, { state: 'editing' })
  }

  async setConfirming(id: string): Promise<RecipeDraftEntity> {
    return this.repo.update(id, { state: 'confirming' })
  }

  async markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity> {
    return this.repo.markSaved(id, recipeId)
  }

  async discardDraft(id: string): Promise<void> {
    await this.repo.delete(id)
  }

  private isHttpUrl(value: string): boolean {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }
}
