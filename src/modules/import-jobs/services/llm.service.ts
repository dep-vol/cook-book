import { injectable } from 'inversify'
import type { ILLMService } from './llm.service.interface'

@injectable()
export class LLMService implements ILLMService {
  getTextGenerationUrl(): string {
    return process.env.TEXT_GENERATION_URL!
  }

  getTextGenerationApiKey(): string {
    return process.env.TEXT_GENERATION_API_KEY!
  }

  getTextGenerationModel(): string {
    return process.env.TEXT_GENERATION_MODEL!
  }

  getImgGenerationUrl(): string {
    return process.env.IMG_GENERATION_URL!
  }

  getImgGenerationApiKey(): string {
    return process.env.IMG_GENERATION_API_KEY!
  }

  getImgGenerationModel(): string {
    return process.env.IMG_GENERATION_MODEL!
  }

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