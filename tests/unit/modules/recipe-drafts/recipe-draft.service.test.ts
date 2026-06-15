import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service'
import type { IRecipeDraftRepository } from '@/modules/recipe-drafts/repositories/recipe-draft.repository.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'

const draft: RecipeDraftEntity = {
  id: 'draft-1',
  channel: 'telegram',
  channelChatId: 'chat-1',
  channelUserId: 'user-1',
  state: 'editing',
  sourceType: 'manual',
  title: null,
  ingredients: [],
  steps: [],
  cookTimeMinutes: null,
  servings: null,
  tags: [],
  sourceText: null,
  sourceUrl: null,
  coverImageKey: null,
  videoUrl: null,
  lastAiSuggestion: null,
  recipeId: null,
  createdAt: new Date('2026-06-11T00:00:00.000Z'),
  updatedAt: new Date('2026-06-11T00:00:00.000Z'),
  expiresAt: new Date('2026-06-18T00:00:00.000Z'),
}

const mockRepo: IRecipeDraftRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findActiveDraft: vi.fn(),
  update: vi.fn(),
  markSaved: vi.fn(),
  delete: vi.fn(),
}

const savedRecipe: RecipeEntity = {
  id: 'recipe-1',
  title: 'Борщ',
  ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
  steps: [{ order: 1, text: 'Нарезать свёклу' }],
  cookTimeMinutes: 90,
  servings: 4,
  tags: ['суп'],
  sourceUrl: null,
  imageKey: null,
  videoUrl: null,
  createdAt: new Date('2026-06-11T00:00:00.000Z'),
  updatedAt: new Date('2026-06-11T00:00:00.000Z'),
}

const mockRecipeService: IRecipeService = {
  getAll: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

describe('RecipeDraftService', () => {
  let service: RecipeDraftService

  beforeEach(() => {
    vi.resetAllMocks()
    service = new RecipeDraftService(mockRepo, mockRecipeService)
  })

  it('createDraft delegates to repository and returns editing state', async () => {
    vi.mocked(mockRepo.create).mockResolvedValue(draft)

    const result = await service.createDraft({
      channel: 'telegram',
      channelChatId: 'chat-1',
      channelUserId: 'user-1',
      sourceType: 'manual',
    })

    expect(mockRepo.create).toHaveBeenCalledWith({
      channel: 'telegram',
      channelChatId: 'chat-1',
      channelUserId: 'user-1',
      sourceType: 'manual',
    })
    expect(result.state).toBe('editing')
  })

  it('getActiveDraft delegates to repository and returns active draft', async () => {
    vi.mocked(mockRepo.findActiveDraft).mockResolvedValue(draft)

    const result = await service.getActiveDraft('telegram', 'chat-1', 'user-1')

    expect(mockRepo.findActiveDraft).toHaveBeenCalledWith('telegram', 'chat-1', 'user-1')
    expect(result).toEqual(draft)
  })

  it('attachCoverImage sets coverImageKey', async () => {
    const updatedDraft = { ...draft, coverImageKey: 'recipes/cover-1.jpg' }
    vi.mocked(mockRepo.update).mockResolvedValue(updatedDraft)

    const result = await service.attachCoverImage('draft-1', 'recipes/cover-1.jpg')

    expect(mockRepo.update).toHaveBeenCalledWith('draft-1', { coverImageKey: 'recipes/cover-1.jpg' })
    expect(result.coverImageKey).toBe('recipes/cover-1.jpg')
  })

  it('attachVideoUrl sets valid videoUrl', async () => {
    const updatedDraft = { ...draft, videoUrl: 'https://example.com/video.mp4' }
    vi.mocked(mockRepo.update).mockResolvedValue(updatedDraft)

    const result = await service.attachVideoUrl('draft-1', 'https://example.com/video.mp4')

    expect(mockRepo.update).toHaveBeenCalledWith('draft-1', { videoUrl: 'https://example.com/video.mp4' })
    expect(result.videoUrl).toBe('https://example.com/video.mp4')
  })

  it('attachVideoUrl rejects a non-http URL before calling repo update', async () => {
    await expect(service.attachVideoUrl('draft-1', 'ftp://example.com/video.mp4')).rejects.toThrow(
      'Video URL must use http or https'
    )

    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('updateDraft rejects a non-http videoUrl before calling repo update', async () => {
    await expect(service.updateDraft('draft-1', { videoUrl: 'ftp://bad' })).rejects.toThrow(
      'Video URL must use http or https'
    )

    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('saveDraft creates a recipe and marks the draft saved', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue({
      ...draft,
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу' }],
    })
    vi.mocked(mockRecipeService.create).mockResolvedValue(savedRecipe)
    vi.mocked(mockRepo.markSaved).mockResolvedValue({ ...draft, state: 'saved', recipeId: 'recipe-1' })

    const recipe = await service.saveDraft('draft-1')

    expect(mockRecipeService.create).toHaveBeenCalledWith({
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу' }],
      cookTimeMinutes: null,
      servings: null,
      tags: [],
      sourceUrl: null,
      imageKey: null,
      videoUrl: null,
    })
    expect(mockRepo.markSaved).toHaveBeenCalledWith('draft-1', 'recipe-1')
    expect(recipe.id).toBe('recipe-1')
  })
})
