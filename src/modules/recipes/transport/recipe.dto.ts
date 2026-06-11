import { z } from 'zod'

// DTO-схемы описывают контракт на входе/выходе (Server Actions, API).
// DTO не покидает TransferLayer — Repository маппит их в Entity.

export const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.string().min(1),
  unit: z.string(),
})

export const StepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string().min(1),
})

const HttpUrlSchema = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}, 'URL must use http or https')

export const CreateRecipeSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  ingredients: z.array(IngredientSchema).min(1, 'Добавьте хотя бы один ингредиент'),
  steps: z.array(StepSchema).min(1, 'Добавьте хотя бы один шаг'),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  tags: z.array(z.string()).default([]),
  sourceUrl: z.string().url().nullable().optional(),
  imageKey: z.string().nullable().optional(),
  videoUrl: HttpUrlSchema.nullable().optional(),
})

export const UpdateRecipeSchema = CreateRecipeSchema.partial()

export type CreateRecipeDTO = z.infer<typeof CreateRecipeSchema>
export type UpdateRecipeDTO = z.infer<typeof UpdateRecipeSchema>
