import { injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import type { IRecipeParser, ParsedRecipe } from '@/modules/import-jobs/services/recipe-parser.interface'

export const ParsedRecipeSchema = z.object({
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

export function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/s)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Extract recipe information from the user's input and respond with a JSON object only, no markdown. The JSON must follow this exact structure:
{
  "title": "Recipe name",
  "ingredients": [{"name": "ingredient name", "amount": "100", "unit": "г"}],
  "steps": [{"order": 1, "text": "Step description"}],
  "cookTimeMinutes": 30,
  "servings": 4,
  "tags": ["tag1", "tag2"]
}
Rules:
- Use null for cookTimeMinutes and servings if unknown.
- Tags must be short keywords in the same language as the recipe text.
- steps[].order must start at 1 and increment by 1.
- Respond with valid JSON only. No markdown, no explanations.`

@injectable()
export class DeepSeekRecipeParser implements IRecipeParser {
  private readonly client: OpenAI

  constructor() {
    this.client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    })
  }

  async parseText(text: string): Promise<ParsedRecipe> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('DeepSeek returned empty response')

    const raw = extractJson(content)
    return ParsedRecipeSchema.parse(raw)
  }

  async parsePhoto(base64: string, mimeType: string): Promise<ParsedRecipe> {
    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url' as const,
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            {
              type: 'text' as const,
              text: 'Extract the recipe from this image.',
            },
          ],
        },
      ],
      temperature: 0.1,
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('DeepSeek returned empty response')

    const raw = extractJson(content)
    return ParsedRecipeSchema.parse(raw)
  }
}
