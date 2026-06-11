import type { BotResponse, IBotAdapter } from './bot-adapter.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'

const URL_REGEX = /https?:\/\/\S+/

export class RecipeBot {
  private readonly webUrl: string

  constructor(
    private readonly adapter: IBotAdapter,
    private readonly importService: IImportJobService,
    private readonly draftService: IRecipeDraftService,
  ) {
    this.webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
  }

  register(): this {
    this.adapter.onStart(() => ({
      text:
        'Привет! Я сохраняю рецепты в твою книгу.\n\n' +
        '📝 Пришли текст рецепта — я распознаю его и сохраню.\n' +
        '🔗 Пришли ссылку на рецепт (Instagram, YouTube, кулинарный сайт).\n' +
        '📷 Пришли фото блюда — попробую распознать рецепт из фото.\n\n' +
        'Можно собрать рецепт вручную в интерактивном черновике.\n\n' +
        `Смотреть рецепты: ${this.webUrl}`,
      buttons: [
        [{ text: 'Создать рецепт', data: 'new_recipe' }],
        [{ text: 'Продолжить черновик', data: 'continue_draft' }],
      ],
    }))

    this.adapter.onText(async (text) => {
      const trimmed = text.trim()

      if (URL_REGEX.test(trimmed)) {
        const result = await this.importService.importFromUrl(trimmed)
        if (result.status === 'done' && result.recipeId) {
          return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
        }
        return (
          `❌ Не удалось извлечь рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
          'Убедись что ссылка публичная и содержит рецепт.'
        )
      }

      const result = await this.importService.importFromText(trimmed)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
      }
      return (
        `❌ Не удалось распознать рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
        'Попробуй переформулировать или добавить больше деталей.'
      )
    })

    this.adapter.onPhoto(async (buffer, mimeType, caption) => {
      const result = caption
        ? await this.importService.importFromTextWithPhoto(caption, buffer, mimeType)
        : await this.importService.importFromPhoto(buffer, mimeType)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
      }
      return (
        `❌ Не удалось распознать рецепт из фото: ${result.error ?? 'неизвестная ошибка'}\n\n` +
        'Попробуй описать рецепт текстом или добавь подпись к фото.'
      )
    })

    this.adapter.onCallback(async (data, context) => {
      if (data === 'new_recipe') {
        const draft = await this.draftService.createDraft({
          telegramChatId: context.chatId,
          telegramUserId: context.userId,
          sourceType: 'manual',
        })
        return this.renderDraft(draft)
      }

      if (data === 'continue_draft') {
        const draft = await this.draftService.getActiveDraft(context.chatId, context.userId)
        if (!draft) {
          return {
            text: 'Активного черновика пока нет. Можем создать новый.',
            buttons: [[{ text: 'Создать рецепт', data: 'new_recipe' }]],
          }
        }
        return this.renderDraft(draft)
      }

      const [scope, action, id] = data.split(':')
      if (scope !== 'draft' || !action || !id) {
        return this.renderUnknownCallback()
      }

      switch (action) {
        case 'add_ingredient':
          return {
            text: 'Пришли ингредиент текстом. Например: 200 г муки.',
            buttons: this.renderDraftMenuButtons(id),
          }
        case 'add_step':
          return {
            text: 'Пришли следующий шаг приготовления текстом.',
            buttons: this.renderDraftMenuButtons(id),
          }
        case 'add_photo':
          return {
            text: 'Пришли фото блюда или процесса приготовления.',
            buttons: this.renderDraftMenuButtons(id),
          }
        case 'add_video':
          return {
            text: 'Пришли ссылку на видео с рецептом.',
            buttons: this.renderDraftMenuButtons(id),
          }
        case 'ask_ai':
          return {
            text: 'ИИ-помощник будет доступен на следующем шаге.',
            buttons: this.renderDraftMenuButtons(id),
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
        default:
          return this.renderUnknownCallback()
      }
    })

    return this
  }

  start(): void {
    this.adapter.start()
  }

  private renderDraft(draft: RecipeDraftEntity): BotResponse {
    const title = draft.title ?? 'без названия'
    const ingredientsCount = draft.ingredients.length
    const stepsCount = draft.steps.length
    const photoStatus = draft.coverImageKey ? 'прикреплено' : 'нет'
    const videoStatus = draft.videoUrl ? 'добавлена' : 'нет'

    return {
      text:
        `Черновик рецепта: ${title}\n\n` +
        `Ингредиентов: ${ingredientsCount}\n` +
        `Шагов: ${stepsCount}\n` +
        `Фото: ${photoStatus}\n` +
        `Видео-ссылка: ${videoStatus}`,
      buttons: this.renderDraftMenuButtons(draft.id),
    }
  }

  private renderDraftMenuButtons(draftId: string): BotResponse['buttons'] {
    return [
      [{ text: 'Добавить ингредиент', data: `draft:add_ingredient:${draftId}` }],
      [{ text: 'Добавить шаг', data: `draft:add_step:${draftId}` }],
      [{ text: 'Прикрепить фото', data: `draft:add_photo:${draftId}` }],
      [{ text: 'Добавить видео-ссылку', data: `draft:add_video:${draftId}` }],
      [{ text: 'Спросить ИИ', data: `draft:ask_ai:${draftId}` }],
      [{ text: 'Сохранить', data: `draft:save:${draftId}` }],
    ]
  }

  private renderUnknownCallback(): BotResponse {
    return {
      text: 'Не понял действие. Можно создать новый рецепт или продолжить активный черновик.',
      buttons: [
        [{ text: 'Создать рецепт', data: 'new_recipe' }],
        [{ text: 'Продолжить черновик', data: 'continue_draft' }],
      ],
    }
  }
}
