import Link from 'next/link'
import { getImageUrl } from '@/lib/minio'
import type { RecipeEntity } from '../entities/recipe.entity'

interface RecipeCardProps {
  recipe: RecipeEntity
}

export async function RecipeCard({ recipe }: RecipeCardProps) {
  let imageUrl: string | null = null
  if (recipe.imageKey) {
    try {
      imageUrl = await getImageUrl(recipe.imageKey)
    } catch {
      // MinIO unavailable — render card without image
    }
  }

  return (
    <Link href={`/recipes/${recipe.id}`}>
      <div className="border rounded-lg hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
        {imageUrl && (
          <div className="aspect-video overflow-hidden">
            <img src={imageUrl} alt={recipe.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-4">
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
      </div>
    </Link>
  )
}
