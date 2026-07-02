import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LLMService } from '@/modules/import-jobs/services/llm.service'

describe('LLMService OpenRouter config', () => {
  beforeEach(() => {
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
    process.env.OPENROUTER_API_KEY = 'sk-test'
    process.env.RECOGNITION_MODEL = 'google/gemini-3.1-flash-lite'
    process.env.REFINEMENT_MODEL = 'google/gemini-3.1-flash-lite'
  })
  afterEach(() => {
    delete process.env.OPENROUTER_BASE_URL
    delete process.env.OPENROUTER_API_KEY
    delete process.env.RECOGNITION_MODEL
    delete process.env.REFINEMENT_MODEL
  })

  it('reads OpenRouter base url, key and models from env', () => {
    const svc = new LLMService()
    expect(svc.getLlmBaseUrl()).toBe('https://openrouter.ai/api/v1')
    expect(svc.getLlmApiKey()).toBe('sk-test')
    expect(svc.getRecognitionModel()).toBe('google/gemini-3.1-flash-lite')
    expect(svc.getRefinementModel()).toBe('google/gemini-3.1-flash-lite')
  })
})
