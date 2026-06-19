// src/modules/bot/handlers/import.handler.ts
import { injectable, inject } from 'inversify'
import { ImportJobServiceToken } from '@/tokens/import-job.tokens'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { IImportHandler } from './import.handler.interface'
import type { SetStatus } from '../bot-adapter.interface'

const URL_REGEX = /https?:\/\/\S+/
const WEB_URL = () => process.env.WEB_URL ?? 'http://localhost:3000'

@injectable()
export class ImportHandler implements IImportHandler {
  constructor(
    @inject(ImportJobServiceToken)
    private readonly importService: IImportJobService,
  ) {}

  async handleText(text: string, setStatus?: SetStatus): Promise<string> {
    if (URL_REGEX.test(text)) {
      await setStatus?.('🔗 Извлекаю рецепт из ссылки...')
      const result = await this.importService.importFromUrl(text)
      if (result.status === 'done' && result.recipeId) {
        return `✅ Рецепт сохранён!\n${WEB_URL()}/recipes/${result.recipeId}`
      }
      return `❌ Не удалось извлечь рецепт: ${result.error ?? 'неизвестная ошибка'}\nУбедись что ссылка публичная и содержит рецепт.`
    }

    await setStatus?.('🤖 Распознаю рецепт из текста...')
    const result = await this.importService.importFromText(text)
    if (result.status === 'done' && result.recipeId) {
      return `✅ Рецепт сохранён!\n${WEB_URL()}/recipes/${result.recipeId}`
    }
    return `❌ Не удалось распознать рецепт: ${result.error ?? 'неизвестная ошибка'}\nПопробуй переформулировать или добавить больше деталей.`
  }

  async handlePhoto(buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string> {
    await setStatus?.('🤖 Распознаю рецепт из фото...')
    const result = caption
      ? await this.importService.importFromTextWithPhoto(caption, buffer, mimeType)
      : await this.importService.importFromPhoto(buffer, mimeType)
    if (result.status === 'done' && result.recipeId) {
      return `✅ Рецепт сохранён!\n${WEB_URL()}/recipes/${result.recipeId}`
    }
    return `❌ Не удалось распознать рецепт из фото: ${result.error ?? 'неизвестная ошибка'}\n\nПопробуй описать рецепт текстом или добавь подпись к фото.`
  }
}
