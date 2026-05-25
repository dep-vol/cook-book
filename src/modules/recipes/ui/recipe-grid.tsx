import type { RecipeEntity } from '../entities/recipe.entity'
import { RecipeCard } from './recipe-card'

interface RecipeGridProps {
  recipes: RecipeEntity[]
}

export function RecipeGrid({ recipes }: RecipeGridProps) {
  if (recipes.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <p className="text-xl">Рецептов пока нет</p>
        <p className="mt-2">Добавь первый через Telegram-бота или кнопку ниже</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {recipes.map(recipe => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  )
}
