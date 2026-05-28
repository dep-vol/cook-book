import { Bot } from 'grammy'
import type { IBotAdapter } from '../bot-adapter.interface'

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

  onStart(handler: () => string): void {
    this.bot.command('start', ctx => ctx.reply(handler()))
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

  onPhoto(handler: (buffer: Buffer, mimeType: string) => Promise<string>): void {
    this.bot.on('message:photo', async ctx => {
      await ctx.reply('⏳ Скачиваю фото и обрабатываю...')
      try {
        const photo = ctx.message.photo.at(-1)!
        const file = await ctx.api.getFile(photo.file_id)
        const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`

        const response = await fetch(fileUrl)
        if (!response.ok) throw new Error(`Failed to download photo: ${response.status}`)
        const buffer = Buffer.from(await response.arrayBuffer())

        await ctx.reply(await handler(buffer, 'image/jpeg'))
      } catch (err) {
        await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onPhoto handler:', err)
      }
    })
  }

  start(): void {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
    this.bot.start({ onStart: () => console.log(`Bot started (long polling). Web: ${webUrl}`) })
  }
}
