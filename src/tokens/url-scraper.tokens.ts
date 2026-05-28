import type { ServiceIdentifier } from 'inversify'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'

export const UrlScraperToken: ServiceIdentifier<IUrlScraper> = Symbol.for('UrlScraper')
