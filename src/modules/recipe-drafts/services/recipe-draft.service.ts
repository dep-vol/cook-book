import { inject, injectable } from 'inversify'
import { RecipeDraftRepositoryToken } from '@/tokens/recipe-draft.tokens'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import type { IRecipeDraftRepository } from '../repositories/recipe-draft.repository.interface'
import type { IRecipeDraftService } from './recipe-draft.service.interface'
import type { RecipeDraftEntity, RecipeDraftSourceType } from '../entities/recipe-draft.entity'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'

@injectable()
export class RecipeDraftService implements IRecipeDraftService {
  constructor(
    @inject(RecipeDraftRepositoryToken) private readonly repo: IRecipeDraftRepository,
    @inject(RecipeServiceToken) private readonly recipeService: IRecipeService,
  ) {}

  async createDraft(input: {
    channel: string
    channelChatId: string
    channelUserId: string
    sourceType: RecipeDraftSourceType
  }): Promise<RecipeDraftEntity> {
    return this.repo.create(input)
  }

  async getActiveDraft(channel: string, chatId: string, userId: string): Promise<RecipeDraftEntity | null> {
    return this.repo.findActiveDraft(channel, chatId, userId)
  }

  async updateDraft(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity> {
    if (patch.videoUrl !== undefined && patch.videoUrl !== null && !this.isHttpUrl(patch.videoUrl)) {
      throw new Error('Video URL must use http or https')
    }
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

  async saveDraft(id: string): Promise<RecipeEntity> {
    const draft = await this.repo.findById(id)
    if (!draft) {
      throw new Error(`Recipe draft not found: ${id}`)
    }

    if (!draft.title || draft.title.trim().length === 0 || draft.ingredients.length === 0 || draft.steps.length === 0) {
      const missing: string[] = []
      if (!draft.title || draft.title.trim().length === 0) missing.push('название')
      if (draft.ingredients.length === 0) missing.push('ингредиенты')
      if (draft.steps.length === 0) missing.push('шаги приготовления')
      throw new Error(`Не хватает: ${missing.join(', ')}`)
    }

    const recipe = await this.recipeService.create({
      title: draft.title,
      ingredients: draft.ingredients,
      steps: draft.steps,
      cookTimeMinutes: draft.cookTimeMinutes,
      servings: draft.servings,
      tags: draft.tags,
      sourceUrl: draft.sourceUrl,
      imageKey: draft.coverImageKey,
      videoUrl: draft.videoUrl,
    })

    await this.repo.markSaved(id, recipe.id)
    return recipe
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
