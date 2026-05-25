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

export const CreateRecipeSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  ingredients: z.array(IngredientSchema).min(1, 'Добавьте хотя бы один ингредиент'),
  steps: z.array(StepSchema).min(1, 'Добавьте хотя бы один шаг'),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  tags: z.array(z.string()).default([]),
  sourceUrl: z.string().url().nullable().optional(),
})

export const UpdateRecipeSchema = CreateRecipeSchema.partial()

export type CreateRecipeDTO = z.infer<typeof CreateRecipeSchema>
export type UpdateRecipeDTO = z.infer<typeof UpdateRecipeSchema>
