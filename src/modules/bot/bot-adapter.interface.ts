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

/** Редактирует текущее статусное сообщение (spinner) не создавая новых */
export type SetStatus = (text: string) => Promise<void>

export interface IBotAdapter {
  onStart(handler: () => BotResponse): void
  onText(handler: (text: string, context?: BotCallbackContext, setStatus?: SetStatus) => Promise<string>): void
  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string, context?: BotCallbackContext, setStatus?: SetStatus) => Promise<string>): void
  onCallback(handler: (data: string, context: BotCallbackContext) => Promise<BotResponse>): void
  start(): void
}
