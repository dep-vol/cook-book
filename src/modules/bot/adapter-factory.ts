import type { IBotAdapter } from './bot-adapter.interface'
import { TelegramAdapter } from './adapters/telegram.adapter'

export function createBotAdapter(): IBotAdapter {
  const provider = process.env.BOT_PROVIDER ?? 'telegram'
  switch (provider) {
    case 'telegram': return new TelegramAdapter()
    default: throw new Error(`Unknown BOT_PROVIDER: "${provider}". Supported: telegram`)
  }
}
