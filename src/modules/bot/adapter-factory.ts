import type { IBotAdapter } from './bot-adapter.interface'
import { TelegramAdapter } from './adapters/telegram.adapter'

function createAdapter(provider: string): IBotAdapter {
  switch (provider) {
    case 'telegram': return new TelegramAdapter()
    default: throw new Error(`Unknown bot provider: "${provider}". Supported: telegram`)
  }
}

export function createBotAdapters(): IBotAdapter[] {
  const providers = (process.env.BOT_PROVIDERS ?? 'telegram').split(',').map(p => p.trim()).filter(Boolean)
  return providers.map(createAdapter)
}
