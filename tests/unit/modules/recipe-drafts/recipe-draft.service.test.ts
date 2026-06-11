import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service'
import type { IRecipeDraftRepository } from '@/modules/recipe-drafts/repositories/recipe-draft.repository.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const draft: RecipeDraftEntity = {
  id: 'draft-1',
  telegramChatId: 'chat-1',
  telegramUserId: 'user-1',
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
  findByChatAndActive: vi.fn(),
  update: vi.fn(),
  markSaved: vi.fn(),
  delete: vi.fn(),
}

describe('RecipeDraftService', () => {
  let service: RecipeDraftService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RecipeDraftService(mockRepo)
  })

  it('createDraft delegates to repository and returns editing state', async () => {
    vi.mocked(mockRepo.create).mockResolvedValue(draft)

    const result = await service.createDraft({
      telegramChatId: 'chat-1',
      telegramUserId: 'user-1',
      sourceType: 'manual',
    })

    expect(mockRepo.create).toHaveBeenCalledWith({
      telegramChatId: 'chat-1',
      telegramUserId: 'user-1',
      sourceType: 'manual',
    })
    expect(result.state).toBe('editing')
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
})
