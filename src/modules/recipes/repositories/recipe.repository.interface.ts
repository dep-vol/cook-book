import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'

export interface IRecipeRepository {
  findAll(): Promise<RecipeEntity[]>
  findById(id: string): Promise<RecipeEntity | null>
  create(data: CreateRecipeDTO): Promise<RecipeEntity>
  update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity | null>
  delete(id: string): Promise<void>
}
