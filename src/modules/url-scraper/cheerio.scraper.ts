import { injectable } from 'inversify'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer'
import type { IUrlScraper, ScrapeResult } from './url-scraper.interface'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BODY_MAX_LENGTH = 15000
const BODY_MIN_USEFUL = 300

@injectable()
export class CheerioScraper implements IUrlScraper {
  async scrape(url: string): Promise<ScrapeResult> {
    // fetch не хранит куки между редиректами — cookie-wall'ы (VK autologin и т.п.)
    // роняют его циклом редиректов, поэтому любой провал статики уводим в puppeteer
    const staticResult = await this.scrapeStatic(url).catch(() => null)
    if (staticResult && staticResult.text.length >= BODY_MIN_USEFUL) return staticResult

    const rendered = await this.scrapeRendered(url)
    return { text: rendered.text, imageUrl: rendered.imageUrl ?? staticResult?.imageUrl }
  }

  private async scrapeStatic(url: string): Promise<ScrapeResult> {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)

    const html = await this.decodeResponse(res)
    const $ = cheerio.load(html)
    const imageUrl = $('meta[property="og:image"]').attr('content') || undefined

    $('script, style, nav, footer, header, .related, .sidebar, .comments, #comments').remove()
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    return { text: bodyText.slice(0, BODY_MAX_LENGTH), imageUrl }
  }

  private async decodeResponse(res: Response): Promise<string> {
    const contentType = res.headers.get('content-type') ?? ''
    const charsetMatch = contentType.match(/charset=([\w-]+)/i)
    const charset = charsetMatch?.[1]
    if (charset && !/^utf-?8$/i.test(charset)) {
      const buffer = await res.arrayBuffer()
      try {
        return new TextDecoder(charset).decode(buffer)
      } catch {
        return new TextDecoder('utf-8').decode(buffer)
      }
    }
    return res.text()
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
      $('script, style, nav, footer, header, .related, .sidebar, .comments, #comments').remove()
      return { text: $('body').text().replace(/\s+/g, ' ').trim().slice(0, BODY_MAX_LENGTH), imageUrl }
    } finally {
      await browser.close()
    }
  }
}
