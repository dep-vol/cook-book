export interface BotButton {
  text: string
  data: string
}

export interface BotResponse {
  text: string
  buttons?: BotButton[][]
}

export interface BotCallbackContext {
  chatId: string
  userId: string
}

export interface IBotAdapter {
  onStart(handler: () => BotResponse): void
  onText(handler: (text: string) => Promise<string>): void
  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string) => Promise<string>): void
  onCallback(handler: (data: string, context: BotCallbackContext) => Promise<BotResponse>): void
  start(): void
}
