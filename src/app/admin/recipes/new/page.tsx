'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import { createRecipeAction } from '@/app/actions/recipe.actions'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

export default function AdminNewRecipePage() {
  const router = useRouter()

  async function handleSubmit(data: CreateRecipeDTO) {
    const result = await createRecipeAction(data)
    if ('error' in result) throw new Error(JSON.stringify(result.error))
    router.push('/admin')
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Новый рецепт</h1>
      <RecipeForm onSubmit={handleSubmit} />
    </div>
  )
}
