import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CheerioScraper } from '@/modules/url-scraper/cheerio.scraper'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockPage = {
  goto: vi.fn(),
  content: vi.fn(),
}
const mockBrowser = {
  newPage: vi.fn(() => mockPage),
  close: vi.fn(),
}
vi.mock('puppeteer', () => ({
  default: { launch: vi.fn(() => mockBrowser) },
}))

import puppeteer from 'puppeteer'

function makeResponse(html: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => html } as Response
}

const LONG_HTML = (body: string, head = '') =>
  `<html><head>${head}</head><body>${body}</body></html>`
const richBody = '<p>' + 'Рецепт борща. '.repeat(30) + '</p>'
const richHtml = LONG_HTML(richBody)

describe('CheerioScraper', () => {
  let scraper: CheerioScraper

  beforeEach(() => {
    scraper = new CheerioScraper()
    vi.clearAllMocks()
  })

  it('returns og:description as text when it is at least 50 characters', async () => {
    const ogContent = 'Рецепт борща: свёкла, капуста, морковь, картофель, томатная паста — классика!'
    const html = LONG_HTML('<p>Другой текст</p>', `<meta property="og:description" content="${ogContent}">`)
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.text).toBe(ogContent)
    expect(puppeteer.launch).not.toHaveBeenCalled()
  })

  it('returns og:image as imageUrl when present', async () => {
    const ogContent = 'Рецепт борща: свёкла, капуста, морковь, картофель, томатная паста — классика!'
    const html = LONG_HTML(
      '<p>Текст</p>',
      `<meta property="og:description" content="${ogContent}">
       <meta property="og:image" content="https://example.com/photo.jpg">`,
    )
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.imageUrl).toBe('https://example.com/photo.jpg')
  })

  it('imageUrl is undefined when og:image is absent', async () => {
    mockFetch.mockResolvedValue(makeResponse(richHtml))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.imageUrl).toBeUndefined()
  })

  it('falls back to body text when og:description is shorter than 50 characters', async () => {
    const html = LONG_HTML(richBody, '<meta property="og:description" content="Коротко">')
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.text).toContain('Рецепт борща')
    expect(puppeteer.launch).not.toHaveBeenCalled()
  })

  it('launches puppeteer when static content is shorter than 300 characters', async () => {
    const sparseHtml = LONG_HTML('<p>Мало текста</p>')
    const renderedHtml = LONG_HTML('<p>' + 'Рецепт борща из свёклы. '.repeat(20) + '</p>')
    mockFetch.mockResolvedValue(makeResponse(sparseHtml))
    mockPage.content.mockResolvedValue(renderedHtml)

    const result = await scraper.scrape('https://spa-site.com/recipe')

    expect(puppeteer.launch).toHaveBeenCalledOnce()
    expect(result.text).toContain('Рецепт борща из свёклы')
  })

  it('uses static imageUrl as fallback when puppeteer page has none', async () => {
    const sparseHtml = LONG_HTML(
      '<p>Мало</p>',
      '<meta property="og:image" content="https://example.com/static.jpg">',
    )
    const renderedHtml = LONG_HTML('<p>' + 'Рецепт. '.repeat(20) + '</p>')
    mockFetch.mockResolvedValue(makeResponse(sparseHtml))
    mockPage.content.mockResolvedValue(renderedHtml)

    const result = await scraper.scrape('https://spa-site.com/recipe')

    expect(result.imageUrl).toBe('https://example.com/static.jpg')
  })

  it('closes puppeteer browser even when page.goto throws', async () => {
    mockFetch.mockResolvedValue(makeResponse(LONG_HTML('<p>Мало</p>')))
    mockPage.goto.mockRejectedValue(new Error('Navigation timeout'))

    await expect(scraper.scrape('https://spa-site.com/recipe')).rejects.toThrow('Navigation timeout')
    expect(mockBrowser.close).toHaveBeenCalledOnce()
  })

  it('strips script, style, nav, footer, header from body text', async () => {
    const html = `<html><body><nav>Навигация</nav><header>Шапка</header><p>${'Рецепт. '.repeat(50)}</p><footer>Подвал</footer><script>alert(1)</script></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.text).toContain('Рецепт')
    expect(result.text).not.toContain('Навигация')
    expect(result.text).not.toContain('Шапка')
    expect(result.text).not.toContain('Подвал')
    expect(result.text).not.toContain('alert')
  })

  it('truncates body text to 8000 characters', async () => {
    const html = LONG_HTML(`<p>${'А'.repeat(10000)}</p>`)
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.text.length).toBeLessThanOrEqual(8000)
  })

  it('throws with HTTP status when server returns non-2xx', async () => {
    mockFetch.mockResolvedValue(makeResponse('', 403))

    await expect(scraper.scrape('https://example.com/recipe')).rejects.toThrow('HTTP 403')
  })

  it('passes User-Agent header to fetch', async () => {
    mockFetch.mockResolvedValue(makeResponse(richHtml))

    await scraper.scrape('https://example.com/recipe')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/recipe',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla') }),
      }),
    )
  })
})
