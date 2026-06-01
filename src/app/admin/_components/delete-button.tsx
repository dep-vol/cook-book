'use client'

import { useRouter } from 'next/navigation'
import { deleteRecipeAction } from '@/app/actions/recipe.actions'

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter()

  async function handleClick() {
    if (!confirm('Удалить рецепт?')) return
    await deleteRecipeAction(id)
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      className="text-red-400 hover:text-red-300 text-sm transition-colors"
    >
      Удалить
    </button>
  )
}
