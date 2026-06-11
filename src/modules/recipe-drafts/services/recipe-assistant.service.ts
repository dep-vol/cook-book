import { inject, injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import { LLMServiceToken } from '@/tokens/import-job.tokens'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'
import type { DraftSuggestion, IRecipeAssistantService } from './recipe-assistant.service.interface'

const DraftSuggestionSchema = z.object({
  title: z.string().min(1),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      amount: z.string().min(1),
      unit: z.string(),
    })
  ).min(1),
  steps: z.array(
    z.object({
      order: z.number().int().positive(),
      text: z.string().min(1),
    })
  ).min(1),
  cookTimeMinutes: z.number().int().positive().nullable().default(null),
  servings: z.number().int().positive().nullable().default(null),
  tags: z.array(z.string()).default([]),
})

function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

function toDataUrl(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`
}

const SYSTEM_PROMPT = `You are a recipe drafting assistant. Extract or suggest recipe information from the user's input and respond with JSON only, no markdown.

Required JSON shape:
{
  "title": "Recipe name",
  "ingredients": [{"name": "ingredient name", "amount": "100", "unit": "г"}],
  "steps": [{"order": 1, "text": "Step description"}],
  "cookTimeMinutes": 30,
  "servings": 4,
  "tags": ["tag1", "tag2"]
}

Rules:
- Use valid JSON only.
- Use null for cookTimeMinutes and servings if unknown.
- Keep tags short and in the same language as the recipe.
- steps[].order must start at 1 and increment by 1.`

@injectable()
export class RecipeAssistantService implements IRecipeAssistantService {
  constructor(
    @inject(LLMServiceToken) private readonly llmService: ILLMService,
  ) {}

  async suggestFromText(input: string): Promise<DraftSuggestion> {
    const client = this.createTextClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getTextGenerationModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      temperature: 0.1,
    })

    return this.parseSuggestion(response.choices[0]?.message?.content)
  }

  async suggestFromPhoto(base64: string, mimeType: string, caption?: string): Promise<DraftSuggestion> {
    const client = this.createImageClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getImgGenerationModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: toDataUrl(mimeType, base64) },
            },
            {
              type: 'text' as const,
              text: caption?.trim()
                ? `Suggest a draft from this photo and caption: ${caption.trim()}`
                : 'Suggest a draft from this photo.',
            },
          ],
        },
      ],
      temperature: 0.1,
    })

    return this.parseSuggestion(response.choices[0]?.message?.content)
  }

  private createTextClient(): OpenAI {
    return new OpenAI({
      baseURL: this.llmService.getTextGenerationUrl(),
      apiKey: this.llmService.getTextGenerationApiKey(),
    })
  }

  private createImageClient(): OpenAI {
    return new OpenAI({
      baseURL: this.llmService.getImgGenerationUrl(),
      apiKey: this.llmService.getImgGenerationApiKey(),
    })
  }

  private parseSuggestion(content: string | null | undefined): DraftSuggestion {
    if (!content) {
      throw new Error('Invalid draft suggestion')
    }

    try {
      const raw = extractJson(content)
      return DraftSuggestionSchema.parse(raw)
    } catch {
      throw new Error('Invalid draft suggestion')
    }
  }
}
