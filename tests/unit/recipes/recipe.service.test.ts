import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeService } from '@/modules/recipes/services/recipe.service'
import type { IRecipeRepository } from '@/modules/recipes/repositories/recipe.repository.interface'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'

const mockRecipe: RecipeEntity = {
  id: 'uuid-1',
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

const mockRepo: IRecipeRepository = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteSeveral: vi.fn(),
}

describe('RecipeService', () => {
  let service: RecipeService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RecipeService(mockRepo)
  })

  it('getAll returns all recipes', async () => {
    vi.mocked(mockRepo.findAll).mockResolvedValue([mockRecipe])
    const result = await service.getAll()
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Борщ')
  })

  it('getById returns recipe when found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(mockRecipe)
    const result = await service.getById('uuid-1')
    expect(result.id).toBe('uuid-1')
  })

  it('getById throws when recipe not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null)
    await expect(service.getById('missing-id')).rejects.toThrow('Recipe not found: missing-id')
  })

  it('delete calls repository', async () => {
    vi.mocked(mockRepo.delete).mockResolvedValue(undefined)
    await service.delete('uuid-1')
    expect(mockRepo.delete).toHaveBeenCalledWith('uuid-1')
  })

  it('deleteSeveral calls repository', async () => {
    vi.mocked(mockRepo.deleteSeveral).mockResolvedValue(undefined)
    await service.deleteSeveral(['uuid-1', 'uuid-2'])
    expect(mockRepo.deleteSeveral).toHaveBeenCalledWith(['uuid-1', 'uuid-2'])
  })
})
