import { Bot } from 'grammy'
import type { BotResponse, IBotAdapter } from '../bot-adapter.interface'

export class TelegramAdapter implements IBotAdapter {
  private readonly bot: Bot
  private readonly token: string

  constructor() {
    const token = process.env.BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set in .env')
    this.token = token
    this.bot = new Bot(token)
    this.bot.catch(err => console.error('Unhandled bot error:', err))
  }

  onStart(handler: () => BotResponse): void {
    this.bot.command('start', ctx => {
      const response = handler()
      return ctx.reply(response.text, this.toReplyOptions(response))
    })
  }

  onText(handler: (text: string) => Promise<string>): void {
    this.bot.on('message:text', async ctx => {
      await ctx.reply('⏳ Обрабатываю...')
      try {
        await ctx.reply(await handler(ctx.message.text))
      } catch (err) {
        await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onText handler:', err)
      }
    })
  }

  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string) => Promise<string>): void {
    this.bot.on('message:photo', async ctx => {
      await ctx.reply('⏳ Скачиваю фото и обрабатываю...')
      try {
        const photo = ctx.message.photo.at(-1)!
        const file = await ctx.api.getFile(photo.file_id)
        const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`

        const response = await fetch(fileUrl)
        if (!response.ok) throw new Error(`Failed to download photo: ${response.status}`)
        const buffer = Buffer.from(await response.arrayBuffer())
        const caption = ctx.message.caption?.trim() || undefined

        await ctx.reply(await handler(buffer, 'image/jpeg', caption))
      } catch (err) {
        await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onPhoto handler:', err)
      }
    })
  }

  onCallback(handler: (data: string, context: { chatId: string; userId: string }) => Promise<BotResponse>): void {
    this.bot.on('callback_query:data', async ctx => {
      try {
        await ctx.answerCallbackQuery()
        const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id
        if (!chatId) {
          await ctx.reply('❌ Не удалось определить чат. Попробуй ещё раз.')
          return
        }

        const response = await handler(ctx.callbackQuery.data, {
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
}
