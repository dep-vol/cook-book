import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { ImportJobServiceToken } from '@/tokens/import-job.tokens'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { createBotAdapter } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapter = createBotAdapter()
const importService = container.get(ImportJobServiceToken)
const draftService = container.get(RecipeDraftServiceToken)
const bot = new RecipeBot(adapter, importService, draftService)
bot.register().start()
