import type { IBotAdapter } from './bot-adapter.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'

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
      '📷 Пришли фото блюда — попробую распознать рецепт из фото.\n\n' +
      `Смотреть рецепты: ${this.webUrl}`
    )

    this.adapter.onText(async (text) => {
      const result = await this.service.importFromText(text)
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
