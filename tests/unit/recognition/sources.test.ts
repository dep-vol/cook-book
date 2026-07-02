import { describe, it, expect, vi } from 'vitest'
import { TextSource } from '@/modules/recognition/sources/text.source'
import { PhotoSource } from '@/modules/recognition/sources/photo.source'
import { UrlSource } from '@/modules/recognition/sources/url.source'
import { VideoSource } from '@/modules/recognition/sources/video.source'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'

const scraper: IUrlScraper = { scrape: vi.fn().mockResolvedValue({ text: 'recipe body', imageUrl: 'https://img/cover.jpg' }) }

describe('recognition sources', () => {
  it('TextSource detects text input and passes text through', async () => {
    const s = new TextSource()
    expect(s.detect({ kind: 'text', text: 'hi' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://x' })).toBe(false)
    expect(await s.extract({ kind: 'text', text: 'borsch' })).toEqual({ text: 'borsch' })
  })

  it('PhotoSource detects photo and returns base64 image + caption text', async () => {
    const s = new PhotoSource()
    const input = { kind: 'photo' as const, buffer: Buffer.from('abc'), mimeType: 'image/jpeg', caption: 'cake' }
    expect(s.detect(input)).toBe(true)
    const out = await s.extract(input)
    expect(out.images?.[0]).toEqual({ base64: Buffer.from('abc').toString('base64'), mimeType: 'image/jpeg' })
    expect(out.text).toBe('cake')
  })

  it('UrlSource detects plain http url but NOT video platforms', () => {
    const s = new UrlSource(scraper)
    expect(s.detect({ kind: 'url', url: 'https://eda.ru/recipe/1' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://youtube.com/watch?v=1' })).toBe(false)
    expect(s.detect({ kind: 'text', text: 'x' })).toBe(false)
  })

  it('UrlSource scrapes the page into text + coverImageUrl + sourceUrl', async () => {
    const s = new UrlSource(scraper)
    const out = await s.extract({ kind: 'url', url: 'https://eda.ru/recipe/1' })
    expect(out.text).toBe('recipe body')
    expect(out.coverImageUrl).toBe('https://img/cover.jpg')
    expect(out.sourceUrl).toBe('https://eda.ru/recipe/1')
  })

  it('VideoSource detects youtube/instagram/tiktok urls', () => {
    const s = new VideoSource(scraper)
    expect(s.detect({ kind: 'url', url: 'https://youtu.be/abc' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://www.instagram.com/reel/abc' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://tiktok.com/@u/video/1' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://eda.ru/recipe/1' })).toBe(false)
  })

  it('VideoSource detects VK video/clip urls but not regular vk.com pages', () => {
    const s = new VideoSource(scraper)
    expect(s.detect({ kind: 'url', url: 'https://vkvideo.ru/clip-231763510_456258625' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://vkvideo.ru/video-1_2' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://vk.com/video-123_456' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://vk.com/clip-1_2' })).toBe(true)
    expect(s.detect({ kind: 'url', url: 'https://vk.com/durov' })).toBe(false)
  })

  it('VideoSource scrapes description and marks it as a video transcript', async () => {
    const s = new VideoSource(scraper)
    const out = await s.extract({ kind: 'url', url: 'https://youtu.be/abc' })
    expect(out.text).toContain('recipe body')
    expect(out.sourceUrl).toBe('https://youtu.be/abc')
    expect(out.coverImageUrl).toBe('https://img/cover.jpg')
  })
})
