import type { IBotAdapter } from './bot-adapter.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'

const URL_REGEX = /https?:\/\/\S+/

export class RecipeBot {
  private readonly webUrl: string

  constructor(
    private readonly adapter: IBotAdapter,
    private readonly service: IImportJobService,
  ) {
    this.webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
  }

  register(): this {
    this.adapter.onStart(() =>
      'Привет! Я сохраняю рецепты в твою книгу.\n\n' +
      '📝 Пришли текст рецепта — я распознаю его и сохраню.\n' +
      '🔗 Пришли ссылку на рецепт (Instagram, YouTube, кулинарный сайт).\n' +
      '📷 Пришли фото блюда — попробую распознать рецепт из фото.\n\n' +
      `Смотреть рецепты: ${this.webUrl}`
    )

    this.adapter.onText(async (text) => {
      const trimmed = text.trim()

      if (URL_REGEX.test(trimmed)) {
        const result = await this.service.importFromUrl(trimmed)
        if (result.status === 'done' && result.recipeId) {
          return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
        }
        return (
          `❌ Не удалось извлечь рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
          'Убедись что ссылка публичная и содержит рецепт.'
        )
      }

      const result = await this.service.importFromText(trimmed)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
      }
      return (
        `❌ Не удалось распознать рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
        'Попробуй переформулировать или добавить больше деталей.'
      )
    })

    this.adapter.onPhoto(async (buffer, mimeType) => {
      const result = await this.service.importFromPhoto(buffer, mimeType)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${this.webUrl}/recipes/${result.recipeId}`
      }
      return (
        `❌ Не удалось распознать рецепт из фото: ${result.error ?? 'неизвестная ошибка'}\n\n` +
        'Попробуй описать рецепт текстом.'
      )
    })

    return this
  }

  start(): void {
    this.adapter.start()
  }
}
