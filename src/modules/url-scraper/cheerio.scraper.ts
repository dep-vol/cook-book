import { injectable } from 'inversify'
import * as cheerio from 'cheerio'
import type { IUrlScraper } from './url-scraper.interface'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const OG_MIN_LENGTH = 200
const BODY_MAX_LENGTH = 8000

@injectable()
export class CheerioScraper implements IUrlScraper {
  async scrape(url: string): Promise<string> {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)

    const html = await res.text()
    const $ = cheerio.load(html)

    const ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
    if (ogDescription.length >= OG_MIN_LENGTH) return ogDescription

    $('script, style, nav, footer, header').remove()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    return bodyText.slice(0, BODY_MAX_LENGTH)
  }
}
