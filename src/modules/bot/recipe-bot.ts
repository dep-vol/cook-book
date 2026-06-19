import { inject } from 'inversify'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken } from './bot.tokens'
import type { IBotAdapter } from './bot-adapter.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IDraftHandler } from './handlers/draft.handler.interface'
import type { IImportHandler } from './handlers/import.handler.interface'
import type { ICallbackHandler } from './handlers/callback.handler.interface'

// IBotAdapter не регистрируется в InversifyJS — создаётся вручную в entrypoint
export class RecipeBot {
  private readonly webUrl = process.env.WEB_URL ?? 'http://localhost:3000'

  constructor(
    private readonly adapter: IBotAdapter,
    @inject(RecipeDraftServiceToken)  private readonly draftService: IRecipeDraftService,
    @inject(DraftHandlerToken)        private readonly draftHandler: IDraftHandler,
    @inject(ImportHandlerToken)       private readonly importHandler: IImportHandler,
    @inject(CallbackHandlerToken)     private readonly callbackHandler: ICallbackHandler,
  ) {}

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

    this.adapter.onText(async (text, context, setStatus) => {
      const trimmed = text.trim()
      if (/^https?:\/\/\S+$/.test(trimmed)) {
        return this.importHandler.handleText(trimmed, setStatus)
      }
      if (context) {
        const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)
        if (draft) return this.draftHandler.handleText(draft, trimmed, setStatus)
      }
      return this.importHandler.handleText(trimmed, setStatus)
    })

    this.adapter.onPhoto(async (buffer, mimeType, caption, context, setStatus) => {
      if (context) {
        const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)
        if (draft) return this.draftHandler.handlePhoto(draft, buffer, mimeType, caption, setStatus)
      }
      return this.importHandler.handlePhoto(buffer, mimeType, caption, setStatus)
    })

    this.adapter.onCallback(async (data, context) =>
      this.callbackHandler.handle(data, context)
    )

    return this
  }

  start(): void {
    this.adapter.start()
  }
}
