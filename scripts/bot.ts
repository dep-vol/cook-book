import 'dotenv/config'
import 'reflect-metadata'
import { RecipeBot } from '@/modules/bot/recipe-bot'
import { TelegramAdapter } from '@/modules/bot/adapters/telegram.adapter'
import { ImportJobServiceToken } from '@/tokens/import-job.tokens'
import { container } from '@/container'

const adapter = new TelegramAdapter()
const service = container.get(ImportJobServiceToken)
const bot = new RecipeBot(adapter, service)
bot.register().start()
