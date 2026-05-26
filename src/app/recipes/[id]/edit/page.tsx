'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import { getRecipeByIdAction, updateRecipeAction, deleteRecipeAction } from '@/app/actions/recipe.actions'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

interface EditPageProps {
  params: Promise<{ id: string }>
}

export default function EditRecipePage({ params }: EditPageProps) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<RecipeEntity | null>(null)

  useEffect(() => {
    params.then(p => {
      setId(p.id)
      getRecipeByIdAction(p.id).then(setRecipe)
    })
  }, [params])

  async function handleSubmit(data: CreateRecipeDTO) {
    if (!id) return
    const result = await updateRecipeAction(id, data)
    if ('error' in result) throw new Error(JSON.stringify(result.error))
    router.push(`/recipes/${id}`)
  }

  async function handleDelete() {
    if (!id || !confirm('Удалить рецепт?')) return
    await deleteRecipeAction(id)
    router.push('/')
  }

  if (!recipe) return <div className="text-center py-16 text-gray-400">Загрузка...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Редактировать рецепт</h1>
        <button onClick={handleDelete} className="text-red-500 hover:underline text-sm">
          Удалить
        </button>
      </div>
      <RecipeForm
        onSubmit={handleSubmit}
        initialData={{
          title: recipe.title,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          cookTimeMinutes: recipe.cookTimeMinutes ?? undefined,
          servings: recipe.servings ?? undefined,
          tags: recipe.tags,
          sourceUrl: recipe.sourceUrl ?? undefined,
        }}
      />
    </div>
  )
}
