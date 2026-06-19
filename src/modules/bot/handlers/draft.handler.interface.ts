// src/modules/bot/handlers/draft.handler.interface.ts
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { BotResponse, SetStatus } from '../bot-adapter.interface'

export interface IDraftHandler {
  handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<BotResponse>
  handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption: string | undefined, setStatus?: SetStatus): Promise<BotResponse>
}
