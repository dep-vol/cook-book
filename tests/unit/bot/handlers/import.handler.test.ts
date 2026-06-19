// tests/unit/bot/handlers/import.handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportHandler } from '@/modules/bot/handlers/import.handler'
import type { IImportJobService } from '@/modules/import-jobs/services/import-job.service.interface'
import type { ImportJobEntity } from '@/modules/import-jobs/entities/import-job.entity'

const doneJob: ImportJobEntity = {
  id: 'job-1',
  status: 'done',
  sourceType: 'url',
  rawInput: 'https://example.com',
  recipeId: 'recipe-1',
  error: null,
  createdAt: new Date(),
}

const failedJob: ImportJobEntity = { ...doneJob, status: 'failed', recipeId: null, error: 'HTTP 403' }

const mockImport: IImportJobService = {
  importFromText: vi.fn(),
  importFromPhoto: vi.fn(),
  importFromUrl: vi.fn(),
  importFromTextWithPhoto: vi.fn(),
}

describe('ImportHandler', () => {
  let handler: ImportHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new ImportHandler(mockImport)
  })

  it('handleText с URL вызывает importFromUrl', async () => {
    vi.mocked(mockImport.importFromUrl).mockResolvedValue(doneJob)
    const result = await handler.handleText('https://example.com')
    expect(mockImport.importFromUrl).toHaveBeenCalledWith('https://example.com')
    expect(result).toContain('✅')
    expect(result).toContain('recipe-1')
  })

  it('handleText с обычным текстом вызывает importFromText', async () => {
    vi.mocked(mockImport.importFromText).mockResolvedValue({ ...doneJob, sourceType: 'text' })
    const result = await handler.handleText('Рецепт борща')
    expect(mockImport.importFromText).toHaveBeenCalledWith('Рецепт борща')
    expect(result).toContain('✅')
  })

  it('handleText возвращает ошибку при failed статусе', async () => {
    vi.mocked(mockImport.importFromUrl).mockResolvedValue(failedJob)
    const result = await handler.handleText('https://example.com')
    expect(result).toContain('❌')
    expect(result).toContain('HTTP 403')
  })

  it('handlePhoto без caption вызывает importFromPhoto', async () => {
    vi.mocked(mockImport.importFromPhoto).mockResolvedValue(doneJob)
    const result = await handler.handlePhoto(Buffer.from(''), 'image/jpeg')
    expect(mockImport.importFromPhoto).toHaveBeenCalled()
    expect(result).toContain('✅')
  })

  it('handlePhoto с caption вызывает importFromTextWithPhoto', async () => {
    vi.mocked(mockImport.importFromTextWithPhoto).mockResolvedValue(doneJob)
    const result = await handler.handlePhoto(Buffer.from(''), 'image/jpeg', 'Рецепт борща')
    expect(mockImport.importFromTextWithPhoto).toHaveBeenCalledWith('Рецепт борща', expect.any(Buffer), 'image/jpeg')
    expect(result).toContain('✅')
  })
})
