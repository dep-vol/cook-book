'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import { createRecipeAction } from '@/app/actions/recipe.actions'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

export default function NewRecipePage() {
  const router = useRouter()

  async function handleSubmit(data: CreateRecipeDTO) {
    const result = await createRecipeAction(data)
    if ('error' in result) {
      throw new Error(JSON.stringify(result.error))
    }
    router.push(`/recipes/${result.data.id}`)
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Новый рецепт</h1>
      <RecipeForm onSubmit={handleSubmit} />
    </div>
  )
}
