import { injectable } from 'inversify'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer'
import type { IUrlScraper, ScrapeResult } from './url-scraper.interface'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const OG_MIN_LENGTH = 50
const BODY_MAX_LENGTH = 8000
const BODY_MIN_USEFUL = 300

@injectable()
export class CheerioScraper implements IUrlScraper {
  async scrape(url: string): Promise<ScrapeResult> {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)

    const html = await res.text()
    const $ = cheerio.load(html)
    const imageUrl = $('meta[property="og:image"]').attr('content') || undefined

    const ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
    if (ogDescription.length >= OG_MIN_LENGTH) return { text: ogDescription, imageUrl }

    $('script, style, nav, footer, header').remove()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    if (bodyText.length >= BODY_MIN_USEFUL) return { text: bodyText.slice(0, BODY_MAX_LENGTH), imageUrl }

    const rendered = await this.scrapeRendered(url)
    return { text: rendered.text, imageUrl: rendered.imageUrl ?? imageUrl }
  }

  private async scrapeRendered(url: string): Promise<ScrapeResult> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--user-agent=${USER_AGENT}`,
      ],
    })
    try {
      const page = await browser.newPage()
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      const html = await page.content()
      const $ = cheerio.load(html)
      const imageUrl = $('meta[property="og:image"]').attr('content') || undefined
      const ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
      if (ogDescription.length >= OG_MIN_LENGTH) return { text: ogDescription, imageUrl }
      $('script, style, nav, footer, header').remove()
      return { text: $('body').text().replace(/\s+/g, ' ').trim().slice(0, BODY_MAX_LENGTH), imageUrl }
    } finally {
      await browser.close()
    }
  }
}
