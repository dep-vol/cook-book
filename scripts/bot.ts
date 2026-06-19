// scripts/bot.ts
import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { DraftHandlerToken, CallbackHandlerToken, DraftRendererToken } from '@/modules/bot/bot.tokens'
import { createBotAdapters } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapters = createBotAdapters()
for (const adapter of adapters) {
  new RecipeBot(
    adapter,
    container.get(RecipeDraftServiceToken),
    container.get(RecognitionServiceToken),
    container.get(DraftHandlerToken),
    container.get(CallbackHandlerToken),
    container.get(DraftRendererToken),
  ).register().start()
}
