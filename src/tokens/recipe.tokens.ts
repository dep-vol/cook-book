import type { ServiceIdentifier } from 'inversify'
import type { IRecipeRepository } from '@/modules/recipes/repositories/recipe.repository.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'

// Inversify 8.x использует Symbol.for() как ServiceIdentifier вместо Token-класса.
// Symbol.for() гарантирует один и тот же символ при повторных вызовах в рамках процесса.
export const RecipeRepositoryToken: ServiceIdentifier<IRecipeRepository> = Symbol.for('RecipeRepository')
export const RecipeServiceToken: ServiceIdentifier<IRecipeService> = Symbol.for('RecipeService')
