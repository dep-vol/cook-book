// src/modules/bot/renderer/draft.renderer.ts
import { injectable } from 'inversify'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { BotResponse } from '../bot-adapter.interface'

@injectable()
export class DraftRenderer {
  renderDraft(draft: RecipeDraftEntity): BotResponse {
    return {
      text: this.renderDraftText(draft),
      buttons: this.renderDraftMenuButtons(draft.id),
    }
  }

  renderDraftText(draft: RecipeDraftEntity): string {
    const title = draft.title ?? 'без названия'
    const cookTime = draft.cookTimeMinutes ? `${draft.cookTimeMinutes} мин` : '—'
    const servings = draft.servings ? String(draft.servings) : '—'
    const photoStatus = draft.coverImageKey ? 'прикреплено' : 'нет'
    const videoStatus = draft.videoUrl ? 'добавлена' : 'нет'

    return (
      `📋 Черновик: ${title}\n\n` +
      `Ингредиентов: ${draft.ingredients.length}\n` +
      `Шагов: ${draft.steps.length}\n` +
      `Время готовки: ${cookTime}\n` +
      `Порций: ${servings}\n` +
      `Фото: ${photoStatus}\n` +
      `Видео-ссылка: ${videoStatus}`
    )
  }

  renderDraftMenuButtons(draftId: string): BotResponse['buttons'] {
    return [
      [{ text: '🥕 Добавить ингредиент', data: `draft:add_ingredient:${draftId}` }],
      [{ text: '📝 Добавить шаг', data: `draft:add_step:${draftId}` }],
      [{ text: '📷 Прикрепить фото', data: `draft:add_photo:${draftId}` }],
      [{ text: '🎬 Добавить видео-ссылку', data: `draft:add_video:${draftId}` }],
      [{ text: '🤖 Спросить ИИ (свободный текст)', data: `draft:ask_ai:${draftId}` }],
      [{ text: '💡 Заполнить недостающее', data: `draft:suggest_missing:${draftId}` }],
      [{ text: '💾 Сохранить', data: `draft:save:${draftId}` }],
    ]
  }

  renderUnknownCallback(): BotResponse {
    return {
      text: 'Не понял действие. Можно создать новый рецепт или продолжить активный черновик.',
      buttons: [
        [{ text: 'Создать рецепт', data: 'new_recipe' }],
        [{ text: 'Продолжить черновик', data: 'continue_draft' }],
      ],
    }
  }
}
