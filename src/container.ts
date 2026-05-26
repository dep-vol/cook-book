import 'reflect-metadata'
import { Container } from 'inversify'
import { RecipeRepositoryToken, RecipeServiceToken } from '@/tokens/recipe.tokens'
import { ImportJobRepositoryToken, ImportJobServiceToken, RecipeParserToken } from '@/tokens/import-job.tokens'
import { RecipeRepository } from '@/modules/recipes/repositories/recipe.repository'
import { RecipeService } from '@/modules/recipes/services/recipe.service'
import { ImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository'
import { ImportJobService } from '@/modules/import-jobs/services/import-job.service'
import { DeepSeekRecipeParser } from '@/lib/deepseek'

export const container = new Container()

container.bind(RecipeRepositoryToken).to(RecipeRepository).inSingletonScope()
container.bind(RecipeServiceToken).to(RecipeService).inSingletonScope()
container.bind(ImportJobRepositoryToken).to(ImportJobRepository).inSingletonScope()
container.bind(RecipeParserToken).to(DeepSeekRecipeParser).inSingletonScope()
container.bind(ImportJobServiceToken).to(ImportJobService).inSingletonScope()
