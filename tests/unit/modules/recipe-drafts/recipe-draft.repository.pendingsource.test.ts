import { describe, it, expect } from 'vitest'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'

describe('RecipeDraftEntity shape', () => {
  it('allows sourceType "video" and a pendingSource field', () => {
    const draft: Partial<RecipeDraftEntity> = {
      sourceType: 'video',
      pendingSource: { text: 'caption', sourceUrl: 'https://x', images: [], coverImageUrl: undefined },
    }
    expect(draft.sourceType).toBe('video')
    expect(draft.pendingSource?.text).toBe('caption')
  })
})
