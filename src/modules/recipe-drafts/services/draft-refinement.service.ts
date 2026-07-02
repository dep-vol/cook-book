import { inject, injectable } from 'inversify'
import OpenAI from 'openai'
import { z } from 'zod'
import { LLMServiceToken } from '@/tokens/import-job.tokens'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import type { ILLMService } from '@/modules/import-jobs/services/llm.service.interface'
import type { IRecipeDraftService } from './recipe-draft.service.interface'
import type { RecipeDraftEntity } from '../entities/recipe-draft.entity'
import type { IDraftRefinementService, RefineMessage, RefineResult } from './draft-refinement.service.interface'

const IngredientSchema = z.object({ name: z.string().min(1), amount: z.coerce.string().default(''), unit: z.string().default('') })
const StepSchema = z.object({ order: z.coerce.number().int().positive(), text: z.string().min(1) })

const OperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_field'), field: z.enum(['title', 'cookTimeMinutes', 'servings']), value: z.union([z.string(), z.number(), z.null()]) }),
  z.object({ op: z.literal('set_tags'), tags: z.array(z.string()) }),
  z.object({ op: z.literal('add_ingredients'), items: z.array(IngredientSchema) }),
  z.object({ op: z.literal('remove_ingredient'), index: z.coerce.number().int().nonnegative() }),
  z.object({ op: z.literal('replace_ingredients'), items: z.array(IngredientSchema) }),
  z.object({ op: z.literal('add_steps'), items: z.array(StepSchema) }),
  z.object({ op: z.literal('remove_step'), order: z.coerce.number().int().positive() }),
  z.object({ op: z.literal('replace_steps'), items: z.array(StepSchema) }),
])

export type RefineOperation = z.infer<typeof OperationSchema>

const RefinementResultSchema = z.object({
  operations: z.array(OperationSchema).default([]),
  answer: z.string().optional(),
  summary: z.string().default(''),
})

function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return JSON.parse(match[1].trim())
  return JSON.parse(text.trim())
}

function renumber(steps: Array<{ order: number; text: string }>): Array<{ order: number; text: string }> {
  return steps.map((s, i) => ({ order: i + 1, text: s.text }))
}

/** Чистая логика применения операций. Возвращает патч для updateDraft. */
export function applyOperations(draft: RecipeDraftEntity, operations: RefineOperation[]): Partial<RecipeDraftEntity> {
  let ingredients = [...draft.ingredients]
  let steps = [...draft.steps]
  const patch: Partial<RecipeDraftEntity> = {}

  for (const op of operations) {
    switch (op.op) {
      case 'set_field':
        if (op.field === 'title') patch.title = op.value === null ? null : String(op.value)
        else patch[op.field] = op.value === null ? null : Number(op.value)
        break
      case 'set_tags': patch.tags = op.tags; break
      case 'add_ingredients': ingredients = [...ingredients, ...op.items]; break
      case 'remove_ingredient': ingredients = ingredients.filter((_, i) => i !== op.index); break
      case 'replace_ingredients': ingredients = [...op.items]; break
      case 'add_steps': steps = renumber([...steps, ...op.items]); break
      case 'remove_step': steps = renumber(steps.filter(s => s.order !== op.order)); break
      case 'replace_steps': steps = renumber(op.items); break
    }
  }

  if (ingredients !== draft.ingredients) patch.ingredients = ingredients
  if (steps !== draft.steps) patch.steps = steps
  return patch
}

const SYSTEM_PROMPT = `You help refine a recipe DRAFT. You receive the current draft as JSON and the user's message (text and/or an image). Decide how to change the draft and respond with JSON ONLY:
{"operations": [...], "answer": "optional answer if the user asked a question", "summary": "short human summary of changes in Russian"}
Allowed operations:
- {"op":"set_field","field":"title|cookTimeMinutes|servings","value": string|number|null}
- {"op":"set_tags","tags":["..."]}
- {"op":"add_ingredients","items":[{"name","amount","unit"}]}
- {"op":"remove_ingredient","index":0}
- {"op":"replace_ingredients","items":[...]}
- {"op":"add_steps","items":[{"order":1,"text":"..."}]}
- {"op":"remove_step","order":1}
- {"op":"replace_steps","items":[...]}
Rules:
- Only output operations that reflect the user's intent. If it's only a question, use "answer" and empty operations.
- "summary" must be in Russian, one short line.
- Output valid JSON only.`

@injectable()
export class DraftRefinementService implements IDraftRefinementService {
  constructor(
    @inject(LLMServiceToken) private readonly llm: ILLMService,
    @inject(RecipeDraftServiceToken) private readonly drafts: IRecipeDraftService,
  ) {}

  async refine(draft: RecipeDraftEntity, message: RefineMessage): Promise<RefineResult> {
    const client = new OpenAI({ baseURL: this.llm.getLlmBaseUrl(), apiKey: this.llm.getLlmApiKey(), timeout: 60_000, maxRetries: 2 })

    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: `Текущий черновик:\n${JSON.stringify(this.draftForPrompt(draft))}` },
    ]
    if (message.text) parts.push({ type: 'text', text: `Сообщение пользователя: ${message.text}` })
    if (message.image) parts.push({ type: 'image_url', image_url: { url: `data:${message.image.mimeType};base64,${message.image.base64}` } })

    const response = await client.chat.completions.create({
      model: this.llm.getRefinementModel(),
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: parts },
      ],
    })

    const raw = response.choices[0]?.message?.content
    if (!raw) throw new Error('LLM returned empty response')
    const result = RefinementResultSchema.parse(extractJson(raw))

    const patch = applyOperations(draft, result.operations)
    const updated = Object.keys(patch).length ? await this.drafts.updateDraft(draft.id, patch) : draft
    const summary = result.summary || (result.answer ? '' : 'Изменений не внесено.')
    return { draft: updated, summary, answer: result.answer }
  }

  private draftForPrompt(draft: RecipeDraftEntity) {
    return {
      title: draft.title, ingredients: draft.ingredients, steps: draft.steps,
      cookTimeMinutes: draft.cookTimeMinutes, servings: draft.servings, tags: draft.tags,
    }
  }
}
