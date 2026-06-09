'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import {
  getRecipeByIdAction,
  updateRecipeAction,
  deleteRecipeAction,
} from '@/modules/recipes/transport/recipe.actions'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

interface Props {
  params: Promise<{ id: string }>
}

export default function AdminEditRecipePage({ params }: Props) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<RecipeEntity | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    params.then(p => {
      setId(p.id)
      getRecipeByIdAction(p.id)
        .then(setRecipe)
        .catch(() => setLoadError('Рецепт не найден'))
    })
  }, [params])

  async function handleSubmit(data: CreateRecipeDTO) {
    if (!id) return
    const result = await updateRecipeAction(id, data)
    if ('error' in result) throw new Error(JSON.stringify(result.error))
    router.push('/admin')
  }

  async function handleDelete() {
    if (!id || !confirm('Удалить рецепт?')) return
    await deleteRecipeAction(id)
    router.push('/admin')
  }

  if (loadError) return <div className="text-red-400 py-8">{loadError}</div>
  if (!recipe) return <div className="text-gray-400 py-8">Загрузка...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">Редактировать рецепт</h1>
        <button
          onClick={handleDelete}
          className="text-red-400 hover:text-red-300 text-sm transition-colors"
        >
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
          imageKey: recipe.imageKey ?? undefined,
        }}
      />
    </div>
  )
}
