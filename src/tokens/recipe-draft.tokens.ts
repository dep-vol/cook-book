import type { ServiceIdentifier } from 'inversify'
import type { IRecipeDraftRepository } from '@/modules/recipe-drafts/repositories/recipe-draft.repository.interface'
import type { IRecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IDraftRefinementService } from '@/modules/recipe-drafts/services/draft-refinement.service.interface'

export const RecipeDraftRepositoryToken: ServiceIdentifier<IRecipeDraftRepository> = Symbol.for('RecipeDraftRepository')
export const RecipeDraftServiceToken: ServiceIdentifier<IRecipeDraftService> = Symbol.for('RecipeDraftService')
export const RecipeAssistantServiceToken: ServiceIdentifier<IRecipeAssistantService> = Symbol.for('RecipeAssistantService')
export const DraftRefinementServiceToken: ServiceIdentifier<IDraftRefinementService> = Symbol.for('DraftRefinementService')
