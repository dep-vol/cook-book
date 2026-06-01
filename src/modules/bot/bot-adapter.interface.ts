export interface IBotAdapter {
  onStart(handler: () => string): void
  onText(handler: (text: string) => Promise<string>): void
  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string) => Promise<string>): void
  start(): void
}
