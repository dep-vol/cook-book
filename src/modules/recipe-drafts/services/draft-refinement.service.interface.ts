import type { RecipeDraftEntity } from '../entities/recipe-draft.entity'

export interface RefineMessage {
  text?: string
  image?: { base64: string; mimeType: string }
}

export interface RefineResult {
  draft: RecipeDraftEntity
  summary: string
  answer?: string
}

export interface IDraftRefinementService {
  refine(draft: RecipeDraftEntity, message: RefineMessage): Promise<RefineResult>
}
