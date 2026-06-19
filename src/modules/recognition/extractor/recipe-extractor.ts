import { inject, injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import { LLMServiceToken } from '@/tokens/import-job.tokens'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'
import type { NormalizedContent } from '../sources/source.interface'
import type { ExtractedRecipe, IRecipeExtractor } from './recipe-extractor.interface'

const ExtractedRecipeSchema = z.object({
  title: z.string().min(1).nullable().default(null),
  ingredients: z.array(z.object({
    name: z.string().min(1),
    amount: z.coerce.string().nullable().transform(v => v ?? ''),
    unit: z.string().nullable().transform(v => v ?? ''),
  })).default([]),
  steps: z.array(z.object({
    order: z.coerce.number().int().positive(),
    text: z.string().min(1),
  })).default([]),
  cookTimeMinutes: z.coerce.number().int().positive().nullable().default(null),
  servings: z.coerce.number().int().positive().nullable().default(null),
  tags: z.array(z.string()).default([]),
})

function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

const SYSTEM_PROMPT = `You extract a cooking recipe from the user's input (text and/or images of a recipe page, screenshot, dish, or video description/subtitles). Respond with a JSON object ONLY (no markdown), with this exact shape:
{"title": "name or null", "ingredients": [{"name": "...", "amount": "100", "unit": "г"}], "steps": [{"order": 1, "text": "..."}], "cookTimeMinutes": 30, "servings": 4, "tags": ["..."]}
Rules:
- Extract only what is actually present. If something is unknown: title=null, unknown numbers=null, missing lists=[].
- Never invent ingredients or steps that are not implied by the input.
- steps[].order starts at 1 and increments by 1.
- Tags are short keywords in the language of the recipe.
- Output valid JSON only.`

@injectable()
export class RecipeExtractor implements IRecipeExtractor {
  constructor(@inject(LLMServiceToken) private readonly llm: ILLMService) {}

  async extract(content: NormalizedContent): Promise<ExtractedRecipe> {
    const client = new OpenAI({ baseURL: this.llm.getLlmBaseUrl(), apiKey: this.llm.getLlmApiKey() })

    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []
    if (content.text) parts.push({ type: 'text', text: content.text })
    for (const img of content.images ?? []) {
      parts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })
    }
    if (parts.length === 0) parts.push({ type: 'text', text: 'No content provided.' })

    const response = await client.chat.completions.create({
      model: this.llm.getRecognitionModel(),
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: parts },
      ],
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('LLM returned empty response')
    return ExtractedRecipeSchema.parse(extractJson(raw))
  }
}
