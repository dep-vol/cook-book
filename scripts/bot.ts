import 'dotenv/config'
import 'reflect-metadata'
import { Bot } from 'grammy'
import { container } from '@/container'
import { ImportJobServiceToken } from '@/tokens/import-job.tokens'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set in .env')

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000'

const bot = new Bot(token)
const service = container.get(ImportJobServiceToken)

bot.command('start', ctx =>
  ctx.reply(
    'Привет! Я сохраняю рецепты в твою книгу.\n\n' +
    '📝 Пришли текст рецепта — я распознаю его и сохраню.\n' +
    '📷 Пришли фото блюда — попробую распознать рецепт из фото.\n\n' +
    `Смотреть рецепты: ${WEB_URL}`
  )
)

bot.on('message:text', async ctx => {
  await ctx.reply('⏳ Обрабатываю...')
  try {
    const result = await service.importFromText(ctx.message.text)
    if (result.status === 'done' && result.recipeId) {
      await ctx.reply(`✅ Рецепт сохранён!\n${WEB_URL}/recipes/${result.recipeId}`)
    } else {
      await ctx.reply(
        `❌ Не удалось распознать рецепт: ${result.error ?? 'неизвестная ошибка'}\n` +
        'Попробуй переформулировать или добавить больше деталей.'
      )
    }
  } catch (err) {
    await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
    console.error('Error in message:text handler:', err)
  }
})

bot.on('message:photo', async ctx => {
  await ctx.reply('⏳ Скачиваю фото и обрабатываю...')
  try {
    // ctx.message.photo — массив размеров, берём наибольший (последний элемент)
    const photo = ctx.message.photo.at(-1)!
    const file = await ctx.api.getFile(photo.file_id)
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`

    const response = await fetch(fileUrl)
    if (!response.ok) throw new Error(`Failed to download photo: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    const result = await service.importFromPhoto(buffer, 'image/jpeg')
    if (result.status === 'done' && result.recipeId) {
      await ctx.reply(`✅ Рецепт сохранён!\n${WEB_URL}/recipes/${result.recipeId}`)
    } else {
      await ctx.reply(
        `❌ Не удалось распознать рецепт из фото: ${result.error ?? 'неизвестная ошибка'}\n\n` +
        'Попробуй описать рецепт текстом.'
      )
    }
  } catch (err) {
    await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
    console.error('Error in message:photo handler:', err)
  }
})

bot.catch(err => console.error('Unhandled bot error:', err))

bot.start({ onStart: () => console.log(`Bot started (long polling). Web: ${WEB_URL}`) })
