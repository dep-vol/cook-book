import { container } from '@/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { RecipeGrid } from '@/modules/recipes/ui/recipe-grid'

export default async function RecipesPage() {
  const service = container.get(RecipeServiceToken)
  const recipes = await service.getAll()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Мои рецепты</h1>
      <RecipeGrid recipes={recipes} />
    </div>
  )
}
