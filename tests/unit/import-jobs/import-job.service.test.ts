import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportJobService } from '@/modules/import-jobs/services/import-job.service'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { IRecipeParser } from '@/modules/import-jobs/services/recipe-parser.interface'
import type { ImportJobEntity } from '@/modules/import-jobs/entities/import-job.entity'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'

const pendingJob: ImportJobEntity = {
  id: 'job-1',
  status: 'pending',
  sourceType: 'text',
  rawInput: 'Рецепт борща',
  recipeId: null,
  error: null,
  createdAt: new Date('2026-01-01'),
}

const mockRecipe: RecipeEntity = {
  id: 'recipe-1',
  title: 'Борщ',
  ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
  steps: [{ order: 1, text: 'Нарезать свёклу' }],
  cookTimeMinutes: 90,
  servings: 4,
  tags: ['суп'],
  sourceUrl: null,
  imageKey: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const parsedRecipe = {
  title: 'Борщ',
  ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
  steps: [{ order: 1, text: 'Нарезать свёклу' }],
  cookTimeMinutes: 90 as number | null,
  servings: 4 as number | null,
  tags: ['суп'],
}

const mockRepo: IImportJobRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
}

const mockParser: IRecipeParser = {
  parseText: vi.fn(),
  parsePhoto: vi.fn(),
}

const mockRecipeService: IRecipeService = {
  getAll: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

describe('ImportJobService', () => {
  let service: ImportJobService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ImportJobService(mockRepo, mockParser, mockRecipeService)
  })

  it('importFromText: creates job, parses text, creates recipe, updates to done', async () => {
    vi.mocked(mockRepo.create).mockResolvedValue(pendingJob)
    vi.mocked(mockParser.parseText).mockResolvedValue(parsedRecipe)
    vi.mocked(mockRecipeService.create).mockResolvedValue(mockRecipe)
    vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)

    const result = await service.importFromText('Рецепт борща')

    expect(mockRepo.create).toHaveBeenCalledWith({ sourceType: 'text', rawInput: 'Рецепт борща' })
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'processing')
    expect(mockParser.parseText).toHaveBeenCalledWith('Рецепт борща')
    expect(mockRecipeService.create).toHaveBeenCalledWith({ ...parsedRecipe, sourceUrl: null })
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'done', { recipeId: 'recipe-1' })
    expect(result.status).toBe('done')
    expect(result.recipeId).toBe('recipe-1')
  })

  it('importFromText: updates job to failed when parser throws', async () => {
    vi.mocked(mockRepo.create).mockResolvedValue(pendingJob)
    vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)
    vi.mocked(mockParser.parseText).mockRejectedValue(new Error('DeepSeek timeout'))

    const result = await service.importFromText('Рецепт борща')

    expect(mockRepo.updateStatus).toHaveBeenCalledWith('job-1', 'failed', {
      error: 'DeepSeek timeout',
    })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('DeepSeek timeout')
  })

  it('importFromPhoto: converts buffer to base64, stores as rawInput, calls parsePhoto', async () => {
    const photoJob: ImportJobEntity = { ...pendingJob, sourceType: 'photo' }
    vi.mocked(mockRepo.create).mockResolvedValue(photoJob)
    vi.mocked(mockParser.parsePhoto).mockResolvedValue(parsedRecipe)
    vi.mocked(mockRecipeService.create).mockResolvedValue(mockRecipe)
    vi.mocked(mockRepo.updateStatus).mockResolvedValue(undefined)

    const buffer = Buffer.from('fake-image-data')
    const result = await service.importFromPhoto(buffer, 'image/jpeg')

    const expectedBase64 = buffer.toString('base64')
    expect(mockRepo.create).toHaveBeenCalledWith({ sourceType: 'photo', rawInput: expectedBase64 })
    expect(mockParser.parsePhoto).toHaveBeenCalledWith(expectedBase64, 'image/jpeg')
    expect(result.status).toBe('done')
    expect(result.recipeId).toBe('recipe-1')
  })
})
