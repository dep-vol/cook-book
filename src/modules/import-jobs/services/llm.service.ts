import { injectable } from 'inversify'
import type { ILLMService } from './llm.service.interface'

@injectable()
export class LLMService implements ILLMService {
  getLlmBaseUrl(): string {
    return process.env.OPENROUTER_BASE_URL!
  }

  getLlmApiKey(): string {
    return process.env.OPENROUTER_API_KEY!
  }

  getRecognitionModel(): string {
    return process.env.RECOGNITION_MODEL!
  }

  getRefinementModel(): string {
    return process.env.REFINEMENT_MODEL!
  }
}
