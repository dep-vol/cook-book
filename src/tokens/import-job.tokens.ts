import type { ServiceIdentifier } from 'inversify'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'

export const ImportJobRepositoryToken: ServiceIdentifier<IImportJobRepository> = Symbol.for('ImportJobRepository')
export const LLMServiceToken: ServiceIdentifier<ILLMService> = Symbol.for('LLMService')
