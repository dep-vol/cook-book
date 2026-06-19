// scripts/bot.ts
import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken } from '@/modules/bot/bot.tokens'
import { createBotAdapter } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapter = createBotAdapter()
const bot = new RecipeBot(
  adapter,
  container.get(RecipeDraftServiceToken),
  container.get(DraftHandlerToken),
  container.get(ImportHandlerToken),
  container.get(CallbackHandlerToken),
)
bot.register().start()
