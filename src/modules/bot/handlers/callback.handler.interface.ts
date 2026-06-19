// src/modules/bot/handlers/callback.handler.interface.ts
import type { BotResponse, BotCallbackContext } from '../bot-adapter.interface'

export interface ICallbackHandler {
  handle(data: string, context: BotCallbackContext): Promise<BotResponse>
}
