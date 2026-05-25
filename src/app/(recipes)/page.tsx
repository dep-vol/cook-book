import Link from 'next/link'
import { container } from '@/lib/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { RecipeGrid } from '@/modules/recipes/ui/recipe-grid'

// Async Server Component — выполняется на сервере, никакого useEffect или fetch.
export default async function RecipesPage() {
  const service = container.get(RecipeServiceToken)
  const recipes = await service.getAll()

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Мои рецепты</h1>
        <Link
          href="/recipes/new"
          className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          + Добавить рецепт
        </Link>
      </div>
      <RecipeGrid recipes={recipes} />
    </div>
  )
}
