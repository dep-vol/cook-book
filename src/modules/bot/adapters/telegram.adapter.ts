import { Bot } from 'grammy'
import type { BotResponse, IBotAdapter, SetStatus } from '../bot-adapter.interface'

export class TelegramAdapter implements IBotAdapter {
  readonly channel = 'telegram'
  private readonly bot: Bot
  private readonly token: string

  constructor() {
    this.token = this.getToken()
    this.bot = new Bot(this.token)
    this.bot.catch(err => console.error('Unhandled bot error:', err))
  }

  onStart(handler: () => BotResponse): void {
    this.bot.command('start', ctx => {
      const response = handler()
      return ctx.reply(response.text, this.toReplyOptions(response))
    })
  }

  onText(handler: (text: string, context?: { channel: string; chatId: string; userId: string }, setStatus?: SetStatus) => Promise<string>): void {
    this.bot.on('message:text', async ctx => {
      const statusMsg = await ctx.reply('⏳ Обрабатываю...')
      const chatId = String(ctx.chat.id)
      const userId = String(ctx.from?.id ?? ctx.chat.id)

      const setStatus: SetStatus = async (text) => {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, text).catch(() => {/* ignore edit race */})
      }

      try {
        const result = await handler(ctx.message.text, { channel: this.channel, chatId, userId }, setStatus)
        await ctx.api.editMessageText(chatId, statusMsg.message_id, result)
      } catch (err) {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, '❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onText handler:', err)
      }
    })
  }

  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string, context?: { channel: string; chatId: string; userId: string }, setStatus?: SetStatus) => Promise<string>): void {
    this.bot.on('message:photo', async ctx => {
      const statusMsg = await ctx.reply('⏳ Скачиваю фото...')
      const chatId = String(ctx.chat.id)
      const userId = String(ctx.from?.id ?? ctx.chat.id)

      const setStatus: SetStatus = async (text) => {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, text).catch(() => {/* ignore edit race */})
      }

      try {
        await setStatus('⏳ Скачиваю фото...')
        const photo = ctx.message.photo.at(-1)!
        const file = await ctx.api.getFile(photo.file_id)
        const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`

        await setStatus('⏳ Загружаю фото...')
        const response = await fetch(fileUrl)
        if (!response.ok) throw new Error(`Failed to download photo: ${response.status}`)
        const buffer = Buffer.from(await response.arrayBuffer())
        const caption = ctx.message.caption?.trim() || undefined

        await setStatus('🤖 Анализирую фото...')
        const result = await handler(buffer, 'image/jpeg', caption, { channel: this.channel, chatId, userId }, setStatus)
        await ctx.api.editMessageText(chatId, statusMsg.message_id, result)
      } catch (err) {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, '❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onPhoto handler:', err)
      }
    })
  }

  onCallback(handler: (data: string, context: { channel: string; chatId: string; userId: string }) => Promise<BotResponse>): void {
    this.bot.on('callback_query:data', async ctx => {
      try {
        await ctx.answerCallbackQuery()
        const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id
        if (!chatId) {
          await ctx.reply('❌ Не удалось определить чат. Попробуй ещё раз.')
          return
        }

        const response = await handler(ctx.callbackQuery.data, {
          channel: this.channel,
          chatId: String(chatId),
          userId: String(ctx.from.id),
        })
        await ctx.reply(response.text, this.toReplyOptions(response))
      } catch (err) {
        await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onCallback handler:', err)
      }
    })
  }

  start(): void {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
    this.bot.start({ onStart: () => console.log(`Bot started (long polling). Web: ${webUrl}`) })
  }

  private toReplyOptions(response: BotResponse) {
    if (!response.buttons?.length) return undefined

    return {
      reply_markup: {
        inline_keyboard: response.buttons.map(row =>
          row.map(button => ({ text: button.text, callback_data: button.data }))
        ),
      },
    }
  }

  private getToken() {
    const tokenProvider = process.env.BOT_TOKENS?.split(',').find(token => token.startsWith(this.channel))
    if (!tokenProvider) throw new Error(`No token found for channel: ${this.channel}`)
    return tokenProvider.split(':::')[1]
  }
}
