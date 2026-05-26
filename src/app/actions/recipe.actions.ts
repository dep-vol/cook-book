'use server'

import { revalidatePath } from 'next/cache'
import { container } from '@/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { CreateRecipeSchema, UpdateRecipeSchema } from '@/modules/recipes/transport/recipe.dto'

// Server Actions — TransferLayer.
// Zod-валидация на входе, DTO не покидает этот файл.

export async function getRecipesAction() {
  const service = container.get(RecipeServiceToken)
  return service.getAll()
}

export async function getRecipeByIdAction(id: string) {
  const service = container.get(RecipeServiceToken)
  return service.getById(id)
}

export async function createRecipeAction(formData: unknown) {
  const parsed = CreateRecipeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const service = container.get(RecipeServiceToken)
  const recipe = await service.create(parsed.data)

  revalidatePath('/')
  revalidatePath('/recipes')
  return { data: recipe }
}

export async function updateRecipeAction(id: string, formData: unknown) {
  const parsed = UpdateRecipeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const service = container.get(RecipeServiceToken)
  const recipe = await service.update(id, parsed.data)

  revalidatePath('/')
  revalidatePath(`/recipes/${id}`)
  return { data: recipe }
}

export async function deleteRecipeAction(id: string) {
  const service = container.get(RecipeServiceToken)
  await service.delete(id)

  revalidatePath('/')
  revalidatePath('/recipes')
}
