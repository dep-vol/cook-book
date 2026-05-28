import { inject, injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import type { IRecipeParser, ParsedRecipe } from './recipe-parser.interface'
import type { ILLMService } from './llm.service.interface'
import { LLMServiceToken } from '@/tokens/import-job.tokens'

export const ParsedRecipeSchema = z.object({
  title: z.string().min(1),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      amount: z.string(),
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
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

async function encodeImageToBase64(image: string): Promise<string> {
  return `data:image/jpeg;base64,${image}`;
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
export class RecipeParser implements IRecipeParser {
  constructor(
    @inject(LLMServiceToken) private readonly llmService: ILLMService,
  ) {}
  async parseText(text: string): Promise<ParsedRecipe> {
    const client = new OpenAI({
      baseURL: this.llmService.getTextGenerationUrl(),
      apiKey: this.llmService.getTextGenerationApiKey(),
    })

    const response = await client.chat.completions.create({
      model: this.llmService.getTextGenerationModel(),
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
    const client = new OpenAI({
      baseURL: this.llmService.getImgGenerationUrl(),
      apiKey: this.llmService.getImgGenerationApiKey(),
    });

    const base64Image = await encodeImageToBase64(base64);

    const response = await client.chat.completions.create({
      model: this.llmService.getImgGenerationModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
              },
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
