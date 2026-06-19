// src/modules/bot/handlers/draft.handler.interface.ts
import type { SetStatus } from '../bot-adapter.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

export interface IDraftHandler {
  handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string>
  handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string>
}
