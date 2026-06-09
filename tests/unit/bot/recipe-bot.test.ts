import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeBot } from '@/modules/bot/recipe-bot'
import type { IBotAdapter } from '@/modules/bot/bot-adapter.interface'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { ImportJobEntity } from '@/modules/import-jobs/entities/import-job.entity'

const doneJob: ImportJobEntity = {
  id: 'job-1',
  status: 'done',
  sourceType: 'url',
  rawInput: 'https://example.com/recipe',
  recipeId: 'recipe-1',
  error: null,
  createdAt: new Date(),
}

const failedJob: ImportJobEntity = {
  ...doneJob,
  status: 'failed',
  recipeId: null,
  error: 'HTTP 403',
}

let capturedTextHandler: ((text: string) => Promise<string>) | null = null

const mockAdapter: IBotAdapter = {
  onStart: vi.fn(),
  onText: vi.fn((handler) => { capturedTextHandler = handler }),
  onPhoto: vi.fn(),
  start: vi.fn(),
}

const mockService: IImportJobService = {
  importFromText: vi.fn(),
  importFromPhoto: vi.fn(),
  importFromTextWithPhoto: vi.fn(),
  importFromUrl: vi.fn(),
}

describe('RecipeBot URL detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedTextHandler = null
    const bot = new RecipeBot(mockAdapter, mockService)
    bot.register()
  })

  it('routes URL to importFromUrl, not importFromText', async () => {
    vi.mocked(mockService.importFromUrl).mockResolvedValue(doneJob)

    await capturedTextHandler!('https://example.com/recipe')

    expect(mockService.importFromUrl).toHaveBeenCalledWith('https://example.com/recipe')
    expect(mockService.importFromText).not.toHaveBeenCalled()
  })

  it('routes plain text to importFromText, not importFromUrl', async () => {
    vi.mocked(mockService.importFromText).mockResolvedValue({ ...doneJob, sourceType: 'text' })

    await capturedTextHandler!('Рецепт борща')

    expect(mockService.importFromText).toHaveBeenCalledWith('Рецепт борща')
    expect(mockService.importFromUrl).not.toHaveBeenCalled()
  })

  it('returns success message with recipe link for URL import', async () => {
    vi.mocked(mockService.importFromUrl).mockResolvedValue(doneJob)

    const reply = await capturedTextHandler!('https://example.com/recipe')

    expect(reply).toContain('✅')
    expect(reply).toContain('recipe-1')
  })

  it('returns error message when URL import fails', async () => {
    vi.mocked(mockService.importFromUrl).mockResolvedValue(failedJob)

    const reply = await capturedTextHandler!('https://example.com/recipe')

    expect(reply).toContain('❌')
    expect(reply).toContain('HTTP 403')
  })
})
