import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CheerioScraper } from '@/modules/url-scraper/cheerio.scraper'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(html: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => html } as Response
}

describe('CheerioScraper', () => {
  let scraper: CheerioScraper

  beforeEach(() => {
    scraper = new CheerioScraper()
    vi.clearAllMocks()
  })

  it('returns og:description when it is longer than 200 characters', async () => {
    const ogContent = 'Рецепт борща. '.repeat(20) // 280 chars
    const html = `<html><head><meta property="og:description" content="${ogContent}"></head><body><p>Другой текст</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result).toBe(ogContent)
  })

  it('falls back to body text when og:description is shorter than 200 characters', async () => {
    const html = `<html><head><meta property="og:description" content="Коротко"></head><body><p>Длинный текст рецепта борща с ингредиентами и шагами приготовления</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result).toContain('Длинный текст рецепта борща')
    expect(result).not.toContain('Коротко')
  })

  it('strips script, style, nav, footer, header from body text', async () => {
    const html = `<html><body><nav>Навигация</nav><header>Шапка</header><p>Рецепт</p><footer>Подвал</footer><script>alert(1)</script></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result).toContain('Рецепт')
    expect(result).not.toContain('Навигация')
    expect(result).not.toContain('Шапка')
    expect(result).not.toContain('Подвал')
    expect(result).not.toContain('alert')
  })

  it('truncates body text to 8000 characters', async () => {
    const longText = 'А'.repeat(10000)
    const html = `<html><body><p>${longText}</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    const result = await scraper.scrape('https://example.com/recipe')

    expect(result.length).toBeLessThanOrEqual(8000)
  })

  it('throws with HTTP status when server returns non-2xx', async () => {
    mockFetch.mockResolvedValue(makeResponse('', 403))

    await expect(scraper.scrape('https://example.com/recipe')).rejects.toThrow('HTTP 403')
  })

  it('passes User-Agent header to fetch', async () => {
    const html = `<html><body><p>text</p></body></html>`
    mockFetch.mockResolvedValue(makeResponse(html))

    await scraper.scrape('https://example.com/recipe')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/recipe',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla') }),
      }),
    )
  })
})
