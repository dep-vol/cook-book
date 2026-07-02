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
      [{ text: '✅ Опубликовать', data: `draft:save:${draftId}` }],
      [{ text: '🗑 Удалить черновик', data: `draft:discard:${draftId}` }],
    ]
  }

  renderSourceDecisionButtons(draftId: string): BotResponse['buttons'] {
    return [
      [{ text: '➕ Дополнить текущий', data: `draft:merge:${draftId}` }],
      [{ text: '🆕 Новый рецепт', data: `draft:newfrom:${draftId}` }],
    ]
  }

  renderUnknownCallback(): BotResponse {
    return {
      text: 'Не понял действие. Пришли текст, фото или ссылку — я распознаю рецепт.',
    }
  }
}
