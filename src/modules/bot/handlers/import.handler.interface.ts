// src/modules/bot/handlers/import.handler.interface.ts
import type { SetStatus } from '../bot-adapter.interface'

export interface IImportHandler {
  handleText(text: string, setStatus?: SetStatus): Promise<string>
  handlePhoto(buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string>
}
