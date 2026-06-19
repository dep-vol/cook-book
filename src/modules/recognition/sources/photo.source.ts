import { injectable } from 'inversify'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './source.interface'

@injectable()
export class PhotoSource implements IRecognitionSource {
  detect(input: RecognitionInput): boolean {
    return input.kind === 'photo'
  }

  async extract(input: RecognitionInput): Promise<NormalizedContent> {
    if (input.kind !== 'photo') throw new Error('PhotoSource expects photo input')
    return {
      images: [{ base64: input.buffer.toString('base64'), mimeType: input.mimeType }],
      text: input.caption,
    }
  }
}
