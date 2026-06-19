// src/modules/bot/recipe-bot.ts
import { inject } from 'inversify'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftHandlerToken, CallbackHandlerToken, DraftRendererToken } from './bot.tokens'
import type { IBotAdapter, BotResponse } from './bot-adapter.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecognitionService } from '@/modules/recognition/recognition.service.interface'
import type { IDraftHandler } from './handlers/draft.handler.interface'
import type { ICallbackHandler } from './handlers/callback.handler.interface'
import type { DraftRenderer } from './renderer/draft.renderer'

// IBotAdapter не регистрируется в InversifyJS — создаётся вручную в entrypoint
export class RecipeBot {
  private readonly webUrl = process.env.WEB_URL ?? 'http://localhost:3000'

  constructor(
    private readonly adapter: IBotAdapter,
    @inject(RecipeDraftServiceToken) private readonly draftService: IRecipeDraftService,
    @inject(RecognitionServiceToken) private readonly recognition: IRecognitionService,
    @inject(DraftHandlerToken)       private readonly draftHandler: IDraftHandler,
    @inject(CallbackHandlerToken)    private readonly callbackHandler: ICallbackHandler,
    @inject(DraftRendererToken)      private readonly renderer: DraftRenderer,
  ) {}

  register(): this {
    this.adapter.onStart(() => ({
      text:
        'Привет! Пришли мне рецепт — я распознаю его и соберу черновик:\n\n' +
        '📝 текст рецепта\n🔗 ссылку на сайт или видео (YouTube/Reels/TikTok)\n📷 фото страницы или блюда\n\n' +
        'Дальше можно дорабатывать черновик обычными сообщениями — этим занимается ИИ.\n' +
        `Готовые рецепты: ${this.webUrl}/recipes`,
    }))

    this.adapter.onText(async (text, context, setStatus): Promise<BotResponse> => {
      const ctx = this.ctx(context)
      const draft = ctx ? await this.draftService.getActiveDraft(ctx.channel, ctx.chatId, ctx.userId) : null
      if (draft) return this.draftHandler.handleText(draft, text, setStatus)
      if (!ctx) return { text: 'Не удалось определить чат.' }
      await setStatus?.('🔍 Распознаю рецепт...')
      const created = await this.recognition.recognize(this.textInput(text), ctx)
      return this.renderer.renderDraft(created)
    })

    this.adapter.onPhoto(async (buffer, mimeType, caption, context, setStatus): Promise<BotResponse> => {
      const ctx = this.ctx(context)
      const draft = ctx ? await this.draftService.getActiveDraft(ctx.channel, ctx.chatId, ctx.userId) : null
      if (draft) return this.draftHandler.handlePhoto(draft, buffer, mimeType, caption, setStatus)
      if (!ctx) return { text: 'Не удалось определить чат.' }
      await setStatus?.('🔍 Распознаю рецепт из фото...')
      const created = await this.recognition.recognize({ kind: 'photo', buffer, mimeType, caption }, ctx)
      return this.renderer.renderDraft(created)
    })

    this.adapter.onCallback(async (data, context) => this.callbackHandler.handle(data, context))

    return this
  }

  start(): void {
    this.adapter.start()
  }

  private ctx(context?: { channel: string; chatId: string; userId: string }) {
    return context ? { channel: context.channel, chatId: context.chatId, userId: context.userId } : null
  }

  private textInput(text: string) {
    const trimmed = text.trim()
    return /^https?:\/\/\S+$/.test(trimmed)
      ? ({ kind: 'url', url: trimmed } as const)
      : ({ kind: 'text', text: trimmed } as const)
  }
}
