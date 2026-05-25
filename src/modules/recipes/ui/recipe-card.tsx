import Link from 'next/link'
import type { RecipeEntity } from '../entities/recipe.entity'

interface RecipeCardProps {
  recipe: RecipeEntity
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link href={`/recipes/${recipe.id}`}>
      <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
        <h2 className="text-lg font-semibold truncate">{recipe.title}</h2>
        <div className="mt-2 text-sm text-gray-500 flex gap-3">
          {recipe.cookTimeMinutes && <span>⏱ {recipe.cookTimeMinutes} мин</span>}
          {recipe.servings && <span>🍽 {recipe.servings} порций</span>}
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {recipe.tags.map(tag => (
              <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
