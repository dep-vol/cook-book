// src/modules/bot/handlers/draft.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken, DraftRefinementServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IDraftRefinementService } from '@/modules/recipe-drafts/services/draft-refinement.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { IDraftHandler } from './draft.handler.interface'
import type { BotResponse, SetStatus } from '../bot-adapter.interface'

const URL_REGEX = /^https?:\/\/\S+$/

@injectable()
export class DraftHandler implements IDraftHandler {
  constructor(
    @inject(RecipeDraftServiceToken)      private readonly drafts: IRecipeDraftService,
    @inject(DraftRefinementServiceToken)  private readonly refinement: IDraftRefinementService,
    @inject(RecognitionServiceToken)      private readonly recognition: IRecognitionService,
    @inject(DraftRendererToken)           private readonly renderer: DraftRenderer,
  ) {}

  async handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<BotResponse> {
    // ссылка при активном черновике = новый источник → развилка
    if (URL_REGEX.test(text.trim())) {
      return this.stashSourceAndAsk(draft, { kind: 'url', url: text.trim() }, setStatus)
    }
    await setStatus?.('🤖 ИИ дорабатывает черновик...')
    const { draft: updated, summary, answer } = await this.refinement.refine(draft, { text })
    const responseText = answer ? `🤖 ${answer}\n\n${this.renderer.renderDraftText(updated)}` : `✅ ${summary}\n\n${this.renderer.renderDraftText(updated)}`
    return { text: responseText, buttons: this.renderer.renderDraftMenuButtons(updated.id) }
  }

  async handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption: string | undefined, setStatus?: SetStatus): Promise<BotResponse> {
    return this.stashSourceAndAsk(draft, { kind: 'photo', buffer, mimeType, caption }, setStatus)
  }

  private async stashSourceAndAsk(
    draft: RecipeDraftEntity,
    input: Parameters<IRecognitionService['toContent']>[0],
    setStatus?: SetStatus,
  ): Promise<BotResponse> {
    await setStatus?.('🔍 Извлекаю источник...')
    const content = await this.recognition.toContent(input)
    await this.drafts.updateDraft(draft.id, { pendingSource: content })
    return { text: 'Это к текущему черновику или новый рецепт?', buttons: this.renderer.renderSourceDecisionButtons(draft.id) }
  }
}
