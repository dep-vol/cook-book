'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSeveralRecipesAction } from '@/modules/recipes/transport/recipe.actions'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'
import { DeleteButton } from './delete-button'

interface RecipesTableProps {
  recipes: RecipeEntity[]
}

export function RecipesTable({ recipes }: RecipesTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const allSelected = useMemo(
    () => recipes.length > 0 && selectedIds.length === recipes.length,
    [recipes.length, selectedIds.length],
  )

  function toggleRecipe(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : recipes.map((recipe) => recipe.id))
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return
    if (!confirm(`Удалить рецепты: ${selectedIds.length} шт.?`)) return

    startTransition(async () => {
      await deleteSeveralRecipesAction(selectedIds)
      setSelectedIds([])
      router.refresh()
    })
  }

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/50 px-4 py-3">
        <label className="flex items-center gap-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={recipes.length === 0 || isPending}
            className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-500"
          />
          <span>Выбрать все</span>
        </label>
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={selectedIds.length === 0 || isPending}
          className="rounded border border-red-800 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Удаляю...' : `Удалить выбранные${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
        </button>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-gray-800 bg-gray-900/50">
          <tr className="text-xs text-gray-400 uppercase tracking-wide">
            <th className="px-4 py-3 text-left font-medium w-12" />
            <th className="px-4 py-3 text-left font-medium">Название</th>
            <th className="px-4 py-3 text-left font-medium">Теги</th>
            <th className="px-4 py-3 text-left font-medium">Добавлен</th>
            <th className="px-4 py-3 text-right font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {recipes.map((recipe) => {
            const checked = selectedIds.includes(recipe.id)

            return (
              <tr key={recipe.id} className="border-t border-gray-800 hover:bg-gray-900/30">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRecipe(recipe.id)}
                    disabled={isPending}
                    aria-label={`Выбрать рецепт ${recipe.title}`}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{recipe.title}</td>
                <td className="px-4 py-3 text-gray-400">
                  {recipe.tags.slice(0, 3).join(', ')}
                  {recipe.tags.length > 3 && ' …'}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {recipe.createdAt.toLocaleDateString('ru-RU')}
                </td>
                <td className="px-4 py-3 text-right space-x-4">
                  <Link
                    href={`/admin/recipes/${recipe.id}/edit`}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Редактировать
                  </Link>
                  <DeleteButton id={recipe.id} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {recipes.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-12">Рецептов пока нет</p>
      )}
    </div>
  )
}
