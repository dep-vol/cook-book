// src/modules/bot/handlers/callback.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken, RecipeAssistantServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { BotResponse, BotCallbackContext } from '../bot-adapter.interface'
import type { ICallbackHandler } from './callback.handler.interface'

@injectable()
export class CallbackHandler implements ICallbackHandler {
  constructor(
    @inject(RecipeDraftServiceToken)     private readonly draftService: IRecipeDraftService,
    @inject(RecipeAssistantServiceToken) private readonly assistant: IRecipeAssistantService,
    @inject(DraftRendererToken)          private readonly renderer: DraftRenderer,
  ) {}

  async handle(data: string, context: BotCallbackContext): Promise<BotResponse> {
    if (data === 'new_recipe') {
      const draft = await this.draftService.createDraft({
        channel: 'telegram',
        channelChatId: context.chatId,
        channelUserId: context.userId,
        sourceType: 'manual',
      })
      return this.renderer.renderDraft(draft)
    }

    if (data === 'continue_draft') {
      const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
      if (!draft) {
        return {
          text: 'Активного черновика пока нет. Можем создать новый.',
          buttons: [[{ text: 'Создать рецепт', data: 'new_recipe' }]],
        }
      }
      return this.renderer.renderDraft(draft)
    }

    const [scope, action, id] = data.split(':')
    if (scope !== 'draft' || !action || !id) return this.renderer.renderUnknownCallback()

    return this.handleDraftAction(action, id, context)
  }

  private async handleDraftAction(
    action: string,
    id: string,
    context: BotCallbackContext,
  ): Promise<BotResponse> {
    const buttons = () => this.renderer.renderDraftMenuButtons(id)

    switch (action) {
      case 'add_ingredient':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_ingredient' })
        return {
          text: '🥕 Пришли ингредиент. Например: «200 г муки» или «щепотка соли».\nМожно несколько в одном сообщении — по одному на строку.',
          buttons: buttons(),
        }

      case 'add_step':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_step' })
        return {
          text: '📝 Пришли шаг (или несколько сразу). ИИ нормализует и разобьёт их автоматически.',
          buttons: buttons(),
        }

      case 'add_photo':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_photo' })
        return {
          text: '📷 Пришли фото. ИИ сам определит — это обложка блюда, фото шага или фото с текстом рецепта.',
          buttons: buttons(),
        }

      case 'add_video':
        await this.draftService.updateDraft(id, { pendingAction: 'waiting_for_video' })
        return { text: '🎬 Пришли ссылку на видео с рецептом.', buttons: buttons() }

      case 'ask_ai': {
        const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
        if (!draft) return this.renderer.renderUnknownCallback()
        return {
          text:
            '🤖 Режим ИИ-помощника. Напиши что угодно:\n' +
            '• шаги приготовления\n' +
            '• ингредиенты\n' +
            '• вопрос о рецепте\n\n' +
            'ИИ сам поймёт что ты имеешь в виду и добавит в черновик.',
          buttons: this.renderer.renderDraftMenuButtons(draft.id),
        }
      }

      case 'suggest_missing': {
        const draft = await this.draftService.getActiveDraft('telegram', context.chatId, context.userId)
        if (!draft) return this.renderer.renderUnknownCallback()
        const suggestions = await this.assistant.suggestMissingFields(draft)
        if (!suggestions.length) {
          return { text: '✅ Черновик выглядит полным! Можно сохранять.', buttons: buttons() }
        }
        const patch: Record<string, unknown> = {}
        let text = '💡 ИИ заполнил недостающие поля:\n\n'
        for (const s of suggestions) { patch[s.field] = s.value; text += `• ${s.suggestion}\n` }
        const updated = await this.draftService.updateDraft(id, patch as Partial<RecipeDraftEntity>)
        return { text, buttons: this.renderer.renderDraftMenuButtons(updated.id) }
      }

      case 'save':
        await this.draftService.setConfirming(id)
        return {
          text: 'Проверь черновик перед сохранением. Финальное сохранение появится на следующем шаге.',
          buttons: [
            [{ text: 'Подтвердить сохранение', data: `draft:confirm_save:${id}` }],
            [{ text: 'Вернуться к черновику', data: `draft:back:${id}` }],
          ],
        }

      case 'confirm_save':
        try {
          const recipe = await this.draftService.saveDraft(id)
          return {
            text: `✅ Рецепт сохранён!\n${process.env.WEB_URL ?? 'http://localhost:3000'}/recipes/${recipe.id}\n\nЧерновик помечен как сохранённый.`,
          }
        } catch (error) {
          return {
            text: `❌ Не удалось сохранить черновик: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`,
            buttons: buttons(),
          }
        }

      case 'back':
        await this.draftService.setEditing(id)
        return { text: 'Возвращаюсь к черновику.', buttons: buttons() }

      default:
        return this.renderer.renderUnknownCallback()
    }
  }
}
