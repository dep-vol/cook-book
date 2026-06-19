import type { NormalizedContent, RecognitionInput } from './sources/source.interface'
import type { RecipeDraftEntity, RecipeDraftSourceType } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

export interface RecognitionContext {
  channel: string
  chatId: string
  userId: string
}

export interface IRecognitionService {
  recognize(input: RecognitionInput, ctx: RecognitionContext): Promise<RecipeDraftEntity>
  toContent(input: RecognitionInput): Promise<NormalizedContent>
  createDraftFromContent(content: NormalizedContent, sourceType: RecipeDraftSourceType, ctx: RecognitionContext): Promise<RecipeDraftEntity>
  mergeContentIntoDraft(draft: RecipeDraftEntity, content: NormalizedContent): Promise<{ draft: RecipeDraftEntity; summary: string }>
}
