import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/minio', () => ({ uploadImage: vi.fn().mockResolvedValue('cover-key') }))
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true, arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => 'image/jpeg' },
}) as unknown as typeof fetch

import { RecognitionService } from '@/modules/recognition/recognition.service'
import type { IRecognitionSource, NormalizedContent } from '@/modules/recognition/sources/source.interface'
import type { IRecipeExtractor } from '@/modules/recognition/extractor/recipe-extractor.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

const baseDraft: RecipeDraftEntity = {
  id: 'd1', channel: 'telegram', channelChatId: 'c', channelUserId: 'u', state: 'editing',
  sourceType: 'text', title: null, ingredients: [], steps: [], cookTimeMinutes: null, servings: null,
  tags: [], sourceText: null, sourceUrl: null, coverImageKey: null, videoUrl: null,
  lastAiSuggestion: null, pendingAction: null, pendingSource: null, recipeId: null,
  createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(),
}

function src(kind: string, content: NormalizedContent): IRecognitionSource {
  return { detect: (i) => i.kind === kind, extract: vi.fn().mockResolvedValue(content) }
}

const extractor: IRecipeExtractor = {
  extract: vi.fn().mockResolvedValue({
    title: 'Борщ', ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
    steps: [{ order: 1, text: 'Варить' }], cookTimeMinutes: 90, servings: 4, tags: ['суп'],
  }),
}

const draftService = {
  createDraft: vi.fn().mockResolvedValue(baseDraft),
  updateDraft: vi.fn().mockImplementation(async (_id, patch) => ({ ...baseDraft, ...patch })),
} as unknown as IRecipeDraftService

const jobRepo = {
  create: vi.fn().mockResolvedValue({ id: 'j1' }),
  updateStatus: vi.fn().mockResolvedValue(undefined),
  findById: vi.fn(),
} as unknown as IImportJobRepository

function makeService() {
  return new RecognitionService(
    src('text', { text: 't' }),
    src('photo', { images: [{ base64: 'AA', mimeType: 'image/png' }] }),
    src('url', { text: 'u', coverImageUrl: 'https://img/c.jpg', sourceUrl: 'https://eda.ru/1' }),
    src('url', { text: 'v', sourceUrl: 'https://youtu.be/x' }), // video source also kind 'url'
    extractor, draftService, jobRepo,
  )
}

describe('RecognitionService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recognize: creates a draft populated with extracted fields and logs the job', async () => {
    const svc = makeService()
    const draft = await svc.recognize({ kind: 'text', text: 'борщ' }, { channel: 'telegram', chatId: 'c', userId: 'u' })
    expect(draftService.createDraft).toHaveBeenCalled()
    expect(draftService.updateDraft).toHaveBeenCalled()
    expect(draft.title).toBe('Борщ')
    expect(jobRepo.updateStatus).toHaveBeenCalledWith('j1', 'done', expect.objectContaining({ draftId: 'd1' }))
  })

  it('mergeContentIntoDraft: appends ingredients/steps and fills empty fields', async () => {
    const svc = makeService()
    const existing = { ...baseDraft, ingredients: [{ name: 'Соль', amount: '1', unit: 'щепотка' }], steps: [{ order: 1, text: 'Старый' }] }
    const { draft, summary } = await svc.mergeContentIntoDraft(existing, { text: 'добавка' })
    expect(draft.ingredients).toHaveLength(2)
    expect(draft.steps).toHaveLength(2)
    expect(draft.steps[1].order).toBe(2)
    expect(draft.title).toBe('Борщ') // was null → filled
    expect(summary).toContain('ингредиент')
  })
})
