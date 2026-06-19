// scripts/bot.ts
import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken } from '@/modules/bot/bot.tokens'
import { createBotAdapters } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapters = createBotAdapters()
for (const adapter of adapters) {
  new RecipeBot(
    adapter,
    container.get(RecipeDraftServiceToken),
    container.get(DraftHandlerToken),
    container.get(ImportHandlerToken),
    container.get(CallbackHandlerToken),
  ).register().start()
}
