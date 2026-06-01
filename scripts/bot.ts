import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { ImportJobServiceToken } from '@/tokens/import-job.tokens'
import { createBotAdapter } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapter = createBotAdapter()
const service = container.get(ImportJobServiceToken)
const bot = new RecipeBot(adapter, service)
bot.register().start()
