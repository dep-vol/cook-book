import Link from 'next/link'
import { getRecipesAction } from '@/app/actions/recipe.actions'
import { DeleteButton } from './_components/delete-button'

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

      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800 bg-gray-900/50">
            <tr className="text-xs text-gray-400 uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-medium">Название</th>
              <th className="px-4 py-3 text-left font-medium">Теги</th>
              <th className="px-4 py-3 text-left font-medium">Добавлен</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((recipe) => (
              <tr key={recipe.id} className="border-t border-gray-800 hover:bg-gray-900/30">
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
            ))}
          </tbody>
        </table>
        {recipes.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">Рецептов пока нет</p>
        )}
      </div>
    </div>
  )
}
