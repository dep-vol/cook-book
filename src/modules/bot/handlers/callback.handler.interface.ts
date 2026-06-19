// src/modules/bot/handlers/callback.handler.interface.ts
import type { BotResponse } from '../bot-adapter.interface'

export interface ICallbackHandler {
  handle(data: string, context: { chatId: string; userId: string }): Promise<BotResponse>
}
