import 'reflect-metadata'
import { Container } from 'inversify'
import { RecipeRepositoryToken, RecipeServiceToken } from '@/tokens/recipe.tokens'
import { RecipeRepository } from '@/modules/recipes/repositories/recipe.repository'
import { RecipeService } from '@/modules/recipes/services/recipe.service'

export const container = new Container()

container.bind(RecipeRepositoryToken).to(RecipeRepository).inSingletonScope()
container.bind(RecipeServiceToken).to(RecipeService).inSingletonScope()
