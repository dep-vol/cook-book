import type { ServiceIdentifier } from 'inversify'
import type { IRecipeRepository } from '@/modules/recipes/repositories/recipe.repository.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'

export const RecipeRepositoryToken: ServiceIdentifier<IRecipeRepository> = Symbol.for('RecipeRepository')
export const RecipeServiceToken: ServiceIdentifier<IRecipeService> = Symbol.for('RecipeService')
