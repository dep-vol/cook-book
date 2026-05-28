import type { ServiceIdentifier } from 'inversify'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { IRecipeParser } from '@/modules/import-jobs/services/recipe-parser.interface'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'

export const ImportJobRepositoryToken: ServiceIdentifier<IImportJobRepository> = Symbol.for('ImportJobRepository')
export const ImportJobServiceToken: ServiceIdentifier<IImportJobService> = Symbol.for('ImportJobService')
export const LLMServiceToken: ServiceIdentifier<ILLMService> = Symbol.for('LLMService')
export const RecipeParserToken: ServiceIdentifier<IRecipeParser> = Symbol.for('RecipeParser')
