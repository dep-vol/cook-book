import { notFound } from 'next/navigation'
import { container } from '@/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { getImageUrl } from '@/lib/minio'

interface RecipePageProps {
  params: Promise<{ id: string }>
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params
  const service = container.get(RecipeServiceToken)

  let recipe
  try {
    recipe = await service.getById(id)
  } catch {
    notFound()
  }

  let imageUrl: string | null = null
  if (recipe.imageKey) {
    try {
      imageUrl = await getImageUrl(recipe.imageKey)
    } catch {
      // MinIO unavailable — render page without image
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
      </div>

      {imageUrl && (
        <img src={imageUrl} alt={recipe.title}
          className="w-full rounded-lg object-cover max-h-80 mb-6" />
      )}

      <div className="flex gap-4 text-sm text-gray-500 mb-6">
        {recipe.cookTimeMinutes && <span>⏱ {recipe.cookTimeMinutes} мин</span>}
        {recipe.servings && <span>🍽 {recipe.servings} порций</span>}
      </div>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Ингредиенты</h2>
        <ul className="space-y-1">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-medium">{ing.amount} {ing.unit}</span>
              <span>{ing.name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Приготовление</h2>
        <ol className="space-y-3">
          {recipe.steps.map(step => (
            <li key={step.order} className="flex gap-3">
              <span className="font-bold text-gray-400 min-w-[1.5rem]">{step.order}.</span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recipe.tags.map(tag => (
            <span key={tag} className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {recipe.sourceUrl && (
        <a href={recipe.sourceUrl} target="_blank" rel="noreferrer"
          className="mt-4 block text-sm text-blue-500 hover:underline">
          Источник →
        </a>
      )}
    </div>
  )
}
