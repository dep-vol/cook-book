import { injectable } from 'inversify'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './source.interface'

@injectable()
export class TextSource implements IRecognitionSource {
  detect(input: RecognitionInput): boolean {
    return input.kind === 'text'
  }

  async extract(input: RecognitionInput): Promise<NormalizedContent> {
    if (input.kind !== 'text') throw new Error('TextSource expects text input')
    return { text: input.text }
  }
}
