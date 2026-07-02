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
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
    text: async () => html,
  } as unknown as Response
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
    // clearAllMocks не сбрасывает реализации — возвращаем goto дефолт,
    // чтобы mockRejectedValue из одного теста не утекал в следующие
    mockPage.goto.mockResolvedValue(undefined)
  })

  it('returns body text from static HTML when it is long enough (>= 300 chars)', async () => {
    mockFetch.mockResolvedValue(makeResponse(richHtml))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.text).toContain('Рецепт борща')
    expect(puppeteer.launch).not.toHaveBeenCalled()
  })

  it('returns og:image as imageUrl when present', async () => {
    const html = LONG_HTML(
      richBody,
      '<meta property="og:image" content="https://example.com/photo.jpg">',
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

  it('truncates body text to 15000 characters', async () => {
    const html = LONG_HTML(`<p>${'А'.repeat(20000)}</p>`)
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.text.length).toBeLessThanOrEqual(15000)
  })

  it('falls back to puppeteer when fetch throws (e.g. redirect loop)', async () => {
    const renderedHtml = LONG_HTML('<p>' + 'Рецепт борща из свёклы. '.repeat(20) + '</p>')
    mockFetch.mockRejectedValue(new Error('fetch failed'))
    mockPage.content.mockResolvedValue(renderedHtml)

    const result = await scraper.scrape('https://vkvideo.ru/clip-1_2')

    expect(puppeteer.launch).toHaveBeenCalledOnce()
    expect(result.text).toContain('Рецепт борща из свёклы')
  })

  it('falls back to puppeteer when server returns non-2xx', async () => {
    const renderedHtml = LONG_HTML('<p>' + 'Рецепт борща из свёклы. '.repeat(20) + '</p>')
    mockFetch.mockResolvedValue(makeResponse('', 403))
    mockPage.content.mockResolvedValue(renderedHtml)

    const result = await scraper.scrape('https://example.com/recipe')

    expect(puppeteer.launch).toHaveBeenCalledOnce()
    expect(result.text).toContain('Рецепт борща из свёклы')
  })

  it('propagates puppeteer error when both fetch and rendering fail', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'))
    mockPage.goto.mockRejectedValue(new Error('Navigation timeout'))

    await expect(scraper.scrape('https://vkvideo.ru/clip-1_2')).rejects.toThrow('Navigation timeout')
    expect(mockBrowser.close).toHaveBeenCalledOnce()
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
