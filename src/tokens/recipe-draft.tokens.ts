import type { ServiceIdentifier } from 'inversify'
import type { IRecipeDraftRepository } from '@/modules/recipe-drafts/repositories/recipe-draft.repository.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'

export const RecipeDraftRepositoryToken: ServiceIdentifier<IRecipeDraftRepository> = Symbol.for('RecipeDraftRepository')
export const RecipeDraftServiceToken: ServiceIdentifier<IRecipeDraftService> = Symbol.for('RecipeDraftService')
