import { inject, injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import { LLMServiceToken } from '@/tokens/import-job.tokens'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'
import type {
  DraftSuggestion,
  IRecipeAssistantService,
  MissingFieldSuggestion,
  PhotoClassification,
  TextClassificationResult,
} from './recipe-assistant.service.interface'
import type { RecipeDraftEntity } from '../entities/recipe-draft.entity'

// ──────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────

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

const StepsSchema = z.array(
  z.object({ order: z.number().int().positive(), text: z.string().min(1) })
).min(1)

const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.string().min(1),
  unit: z.string(),
})

const TextClassificationSchema = z.object({
  type: z.enum(['steps', 'ingredients', 'question', 'mixed']),
  steps: z.array(z.object({
    order: z.coerce.number().transform(Math.round).pipe(z.number().int().positive()),
    text: z.string().min(1),
  })).optional(),
  ingredients: z.array(z.object({
    name: z.string().min(1),
    amount: z.coerce.string().min(1),
    unit: z.string(),
  })).optional(),
  answer: z.string().optional(),
  suggestion: z.object({
    cookTimeMinutes: z.coerce.number().int().positive().nullable().optional(),
    servings: z.coerce.number().int().positive().nullable().optional(),
    title: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
})

const PhotoClassificationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cover') }),
  z.object({ type: z.literal('step'), stepOrder: z.number().int().positive() }),
  z.object({
    type: z.literal('recipe'),
    extracted: DraftSuggestionSchema,
  }),
])

const MissingFieldsSchema = z.array(z.object({
  field: z.enum(['cookTimeMinutes', 'servings', 'tags', 'title']),
  suggestion: z.string(),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
}))

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

function toDataUrl(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`
}

function draftSummary(draft: RecipeDraftEntity): string {
  return JSON.stringify({
    title: draft.title,
    stepsCount: draft.steps.length,
    ingredientsCount: draft.ingredients.length,
    steps: draft.steps,
    cookTimeMinutes: draft.cookTimeMinutes,
    servings: draft.servings,
    tags: draft.tags,
  })
}

// ──────────────────────────────────────────────
// Prompts
// ──────────────────────────────────────────────

const FULL_SUGGESTION_PROMPT = `You are a recipe drafting assistant. Extract or suggest recipe information from the user's input and respond with JSON only, no markdown.

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

const NORMALIZE_STEPS_PROMPT = `You are a recipe step normalizer. The user sends text describing one or more cooking steps.
Split into individual steps if needed, clean up the language, make instructions clear and actionable.
Respond with JSON only: [{"order": <startOrder>, "text": "..."}, ...]
The order starts from the number provided by the user in the system message.`

const NORMALIZE_INGREDIENT_PROMPT = `You are a recipe ingredient parser. Extract name, amount, and unit from user input.
Respond with JSON only: {"name": "flour", "amount": "200", "unit": "г"}
If amount or unit is unclear, use reasonable defaults. Keep language matching user input.`

const CLASSIFY_TEXT_PROMPT = `You are a recipe assistant. The user is building a recipe draft. Classify their free-form message.
You will receive the current draft state in the system message.

Respond with a single JSON object. No markdown, no comments, no extra text.

JSON shape:
{
  "type": "steps",
  "steps": [{"order": 1, "text": "Step text here"}],
  "suggestion": {"cookTimeMinutes": null, "servings": null, "title": null, "tags": []}
}

Rules:
- "type" must be one of: "steps", "ingredients", "question", "mixed".
- If user asks a question — set type="question" and include "answer" field with a helpful response.
- If user writes cooking steps — set type="steps", populate "steps" array. Continue order from existing step count.
- If user writes ingredients (with amounts) — set type="ingredients", populate "ingredients" array.
- If message contains both steps and ingredients — set type="mixed" and populate both arrays.
- "steps": [{"order": <integer>, "text": "<step description>"}]
- "ingredients": [{"name": "<name>", "amount": "<amount>", "unit": "<unit>"}]
- "suggestion" is optional — only include if you can confidently fill a missing field.
- Respond in the same language as the user's message.
- Output ONLY valid JSON, nothing else.`

const CLASSIFY_PHOTO_PROMPT = `You are a recipe photo classifier. Analyze the photo and current draft context (provided in system message).

Classify the photo into one of:
1. "cover" — finished dish photo, suitable as recipe cover
2. "step" — photo of cooking process, belongs to a specific step (pick the most likely stepOrder from the draft)
3. "recipe" — photo contains text of a recipe (handwritten, printed, screen), extract it

Respond with JSON only:
- For cover: {"type": "cover"}
- For step: {"type": "step", "stepOrder": <number>}
- For recipe text: {"type": "recipe", "extracted": { full DraftSuggestion object }}`

const MISSING_FIELDS_PROMPT = `You are a recipe completion assistant. Analyze the draft (provided in system message) and suggest values for missing fields.
Only suggest fields that are truly missing (null/empty) and where you can make a confident suggestion.

Respond with JSON array (empty array if nothing to suggest):
[{"field": "cookTimeMinutes"|"servings"|"tags"|"title", "suggestion": "human-readable reason", "value": <number|string|string[]>}]

Rules:
- "value" for cookTimeMinutes must be a number (minutes)
- "value" for servings must be a number
- "value" for tags must be an array of strings
- "value" for title must be a string
- Respond in the same language as the recipe content.`

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

@injectable()
export class RecipeAssistantService implements IRecipeAssistantService {
  constructor(
    @inject(LLMServiceToken) private readonly llmService: ILLMService,
  ) {}

  // ── Full suggestion (original methods) ──────

  async suggestFromText(input: string): Promise<DraftSuggestion> {
    const client = this.createTextClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getTextGenerationModel(),
      messages: [
        { role: 'system', content: FULL_SUGGESTION_PROMPT },
        { role: 'user', content: input },
      ],
      temperature: 0.1,
    })
    return this.parse(response.choices[0]?.message?.content, DraftSuggestionSchema)
  }

  async suggestFromPhoto(base64: string, mimeType: string, caption?: string): Promise<DraftSuggestion> {
    const client = this.createImageClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getImgGenerationModel(),
      messages: [
        { role: 'system', content: FULL_SUGGESTION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: toDataUrl(mimeType, base64) } },
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
    return this.parse(response.choices[0]?.message?.content, DraftSuggestionSchema)
  }

  // ── Step normalization ───────────────────────

  async normalizeSteps(text: string, existingCount: number): Promise<Array<{ order: number; text: string }>> {
    const client = this.createTextClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getTextGenerationModel(),
      messages: [
        {
          role: 'system',
          content: NORMALIZE_STEPS_PROMPT + `\nStart ordering from ${existingCount + 1}.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
    })
    return this.parse(response.choices[0]?.message?.content, StepsSchema)
  }

  // ── Ingredient normalization ─────────────────

  async normalizeIngredient(text: string): Promise<{ name: string; amount: string; unit: string }> {
    const client = this.createTextClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getTextGenerationModel(),
      messages: [
        { role: 'system', content: NORMALIZE_INGREDIENT_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
    })
    return this.parse(response.choices[0]?.message?.content, IngredientSchema)
  }

  // ── Free-form text classification ────────────

  async classifyText(text: string, draft: RecipeDraftEntity): Promise<TextClassificationResult> {
    const client = this.createTextClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getTextGenerationModel(),
      messages: [
        {
          role: 'system',
          content: CLASSIFY_TEXT_PROMPT + `\n\nCurrent draft:\n${draftSummary(draft)}`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    })
    return this.parse(response.choices[0]?.message?.content, TextClassificationSchema)
  }

  // ── Photo classification ─────────────────────

  async classifyPhoto(
    base64: string,
    mimeType: string,
    draft: RecipeDraftEntity,
    caption?: string,
  ): Promise<PhotoClassification> {
    const client = this.createImageClient()
    const userText = caption?.trim()
      ? `Caption: "${caption.trim()}"\n\nClassify this photo for the recipe draft.`
      : 'Classify this photo for the recipe draft.'

    const response = await client.chat.completions.create({
      model: this.llmService.getImgGenerationModel(),
      messages: [
        {
          role: 'system',
          content: CLASSIFY_PHOTO_PROMPT + `\n\nCurrent draft:\n${draftSummary(draft)}`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: toDataUrl(mimeType, base64) } },
            { type: 'text' as const, text: userText },
          ],
        },
      ],
      temperature: 0.1,
    })
    return this.parse(response.choices[0]?.message?.content, PhotoClassificationSchema)
  }

  // ── Missing fields ───────────────────────────

  async suggestMissingFields(draft: RecipeDraftEntity): Promise<MissingFieldSuggestion[]> {
    const hasMissing =
      !draft.cookTimeMinutes ||
      !draft.servings ||
      !draft.tags.length ||
      !draft.title

    if (!hasMissing) return []

    const client = this.createTextClient()
    const response = await client.chat.completions.create({
      model: this.llmService.getTextGenerationModel(),
      messages: [
        {
          role: 'system',
          content: MISSING_FIELDS_PROMPT + `\n\nDraft:\n${draftSummary(draft)}`,
        },
        { role: 'user', content: 'What fields are missing or should be suggested?' },
      ],
      temperature: 0.3,
    })
    return this.parse(response.choices[0]?.message?.content, MissingFieldsSchema)
  }

  // ── Internals ────────────────────────────────

  private createTextClient(): OpenAI {
    return new OpenAI({
      baseURL: this.llmService.getTextGenerationUrl(),
      apiKey: this.llmService.getTextGenerationApiKey(),
      timeout: 30_000, // 30s HTTP timeout
      maxRetries: 0,   // не ретраить — бот сам обрабатывает ошибки
    })
  }

  private createImageClient(): OpenAI {
    return new OpenAI({
      baseURL: this.llmService.getImgGenerationUrl(),
      apiKey: this.llmService.getImgGenerationApiKey(),
      timeout: 30_000, // 30s HTTP timeout
      maxRetries: 0,
    })
  }

  private parse<T>(content: string | null | undefined, schema: z.ZodType<T>): T {
    if (!content) throw new Error('Empty AI response')
    try {
      return schema.parse(extractJson(content))
    } catch {
      throw new Error('Invalid AI response format')
    }
  }
}
