import { injectable, inject } from 'inversify'
import { RecipeRepositoryToken } from '@/tokens/recipe.tokens'
import type { IRecipeRepository } from '../repositories/recipe.repository.interface'
import type { IRecipeService } from './recipe.service.interface'
import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'

@injectable()
export class RecipeService implements IRecipeService {
  constructor(
    @inject(RecipeRepositoryToken) private readonly repo: IRecipeRepository
  ) {}

  async getAll(): Promise<RecipeEntity[]> {
    return this.repo.findAll()
  }

  async getById(id: string): Promise<RecipeEntity> {
    const recipe = await this.repo.findById(id)
    if (!recipe) throw new Error(`Recipe not found: ${id}`)
    return recipe
  }

  async create(data: CreateRecipeDTO): Promise<RecipeEntity> {
    return this.repo.create(data)
  }

  async update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity> {
    const recipe = await this.repo.update(id, data)
    if (!recipe) throw new Error(`Recipe not found: ${id}`)
    return recipe
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id)
  }
}
