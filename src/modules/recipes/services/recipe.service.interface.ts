import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'

export interface IRecipeService {
  getAll(): Promise<RecipeEntity[]>
  getById(id: string): Promise<RecipeEntity>
  create(data: CreateRecipeDTO): Promise<RecipeEntity>
  update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity>
  delete(id: string): Promise<void>
}
