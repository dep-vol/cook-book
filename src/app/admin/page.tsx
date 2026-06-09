import Link from 'next/link'
import { getRecipesAction } from '@/modules/recipes/transport/recipe.actions'
import { RecipesTable } from './_components/recipes-table'

export default async function AdminPage() {
  const recipes = await getRecipesAction()

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-semibold">Рецепты</h1>
          <p className="text-sm text-gray-400 mt-0.5">{recipes.length} записей</p>
        </div>
        <Link
          href="/admin/recipes/new"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          + Добавить рецепт
        </Link>
      </div>
      <RecipesTable recipes={recipes} />
    </div>
  )
}
