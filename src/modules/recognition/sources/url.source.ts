import { inject, injectable } from 'inversify'
import { UrlScraperToken } from '@/tokens/url-scraper.tokens'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './source.interface'
import { isVideoUrl } from './source.interface'

@injectable()
export class UrlSource implements IRecognitionSource {
  constructor(@inject(UrlScraperToken) private readonly scraper: IUrlScraper) {}

  detect(input: RecognitionInput): boolean {
    return input.kind === 'url' && !isVideoUrl(input.url)
  }

  async extract(input: RecognitionInput): Promise<NormalizedContent> {
    if (input.kind !== 'url') throw new Error('UrlSource expects url input')
    const { text, imageUrl } = await this.scraper.scrape(input.url)
    return { text, coverImageUrl: imageUrl, sourceUrl: input.url }
  }
}
