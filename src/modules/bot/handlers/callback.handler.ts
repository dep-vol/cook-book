// src/modules/bot/handlers/callback.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { BotResponse, BotCallbackContext } from '../bot-adapter.interface'
import type { ICallbackHandler } from './callback.handler.interface'
import { isVideoUrl } from '@/modules/recognition/sources/source.interface'

const WEB_URL = () => process.env.WEB_URL ?? 'http://localhost:3000'

@injectable()
export class CallbackHandler implements ICallbackHandler {
  constructor(
    @inject(RecipeDraftServiceToken) private readonly drafts: IRecipeDraftService,
    @inject(RecognitionServiceToken) private readonly recognition: IRecognitionService,
    @inject(DraftRendererToken)      private readonly renderer: DraftRenderer,
  ) {}

  async handle(data: string, context: BotCallbackContext): Promise<BotResponse> {
    const [scope, action, id] = data.split(':')
    if (scope !== 'draft' || !action || !id) return this.renderer.renderUnknownCallback()

    const draft = await this.drafts.getActiveDraft(context.channel, context.chatId, context.userId)
    if (!draft || draft.id !== id) return this.renderer.renderUnknownCallback()
    const buttons = () => this.renderer.renderDraftMenuButtons(id)

    switch (action) {
      case 'merge': {
        if (!draft.pendingSource) return { text: 'Источник не найден, пришли его снова.', buttons: buttons() }
        const { draft: updated, summary } = await this.recognition.mergeContentIntoDraft(draft, draft.pendingSource)
        await this.drafts.updateDraft(id, { pendingSource: null })
        return { text: `✅ ${summary}\n\n${this.renderer.renderDraftText(updated)}`, buttons: buttons() }
      }

      case 'newfrom': {
        if (!draft.pendingSource) return { text: 'Источник не найден, пришли его снова.', buttons: buttons() }
        const content = draft.pendingSource
        await this.drafts.discardDraft(id)
        const sourceType = content.sourceUrl && isVideoUrl(content.sourceUrl) ? 'video'
          : content.sourceUrl ? 'url'
          : content.images?.length ? 'photo'
          : 'text'
        const created = await this.recognition.createDraftFromContent(
          content,
          sourceType,
          { channel: context.channel, chatId: context.chatId, userId: context.userId },
        )
        return this.renderer.renderDraft(created)
      }

      case 'save':
        await this.drafts.setConfirming(id)
        return {
          text: 'Опубликовать черновик как рецепт?',
          buttons: [
            [{ text: '✅ Подтвердить', data: `draft:confirm_save:${id}` }],
            [{ text: '← Назад', data: `draft:back:${id}` }],
          ],
        }

      case 'confirm_save':
        try {
          const recipe = await this.drafts.saveDraft(id)
          return { text: `✅ Опубликовано!\nРецепт: ${WEB_URL()}/recipes/${recipe.id}\nРучная правка: ${WEB_URL()}/admin/recipes/${recipe.id}/edit` }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'неизвестная ошибка'
          const hint = message.startsWith('Не хватает:') ? '\nПришли это сообщением — я добавлю в черновик.' : ''
          return { text: `❌ Не удалось опубликовать: ${message}${hint}`, buttons: buttons() }
        }

      case 'back': {
        const updated = await this.drafts.setEditing(id)
        return this.renderer.renderDraft(updated)
      }

      case 'discard':
        await this.drafts.discardDraft(id)
        return { text: '🗑 Черновик удалён. Пришли текст, фото или ссылку, чтобы начать новый.' }

      default:
        return this.renderer.renderUnknownCallback()
    }
  }
}
