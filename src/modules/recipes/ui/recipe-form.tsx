'use client'

import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { RecipeFormViewModel } from '../view-models/recipe-form.vm'
import type { CreateRecipeDTO } from '../transport/recipe.dto'

interface RecipeFormProps {
  onSubmit: (data: CreateRecipeDTO) => Promise<void>
  initialData?: Partial<CreateRecipeDTO>
}

// observer() подписывает компонент на MobX observable — аналог .use() из @foxford/vm.
// При любом изменении vm перерендерится только этот компонент, не родитель.

export const RecipeForm = observer(function RecipeForm({ onSubmit, initialData }: RecipeFormProps) {
  // useState с функцией-инициализатором создаёт VM один раз.
  const [vm] = useState(() => new RecipeFormViewModel(onSubmit, initialData))

  return (
    <form onSubmit={(e) => { e.preventDefault(); vm.submit() }} className="space-y-6">
      {vm.error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">{vm.error}</div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Название *</label>
        <input
          className="w-full border rounded-lg px-3 py-2"
          value={vm.title}
          onChange={e => vm.setTitle(e.target.value)}
          placeholder="Борщ украинский"
          required
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Ингредиенты *</label>
          <button type="button" onClick={() => vm.addIngredient()}
            className="text-sm text-blue-500 hover:underline">+ Добавить</button>
        </div>
        {vm.ingredients.map((ing, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="Название"
              value={ing.name} onChange={e => vm.setIngredientField(i, 'name', e.target.value)} />
            <input className="w-20 border rounded px-2 py-1 text-sm" placeholder="Кол-во"
              value={ing.amount} onChange={e => vm.setIngredientField(i, 'amount', e.target.value)} />
            <input className="w-16 border rounded px-2 py-1 text-sm" placeholder="Ед."
              value={ing.unit} onChange={e => vm.setIngredientField(i, 'unit', e.target.value)} />
            {vm.ingredients.length > 1 && (
              <button type="button" onClick={() => vm.removeIngredient(i)}
                className="text-red-400 hover:text-red-600">✕</button>
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Шаги приготовления *</label>
          <button type="button" onClick={() => vm.addStep()}
            className="text-sm text-blue-500 hover:underline">+ Добавить</button>
        </div>
        {vm.steps.map((step, i) => (
          <div key={i} className="flex gap-2 mb-2 items-start">
            <span className="text-gray-400 font-medium pt-2 min-w-[1.5rem]">{step.order}.</span>
            <textarea className="flex-1 border rounded px-2 py-1 text-sm" rows={2} placeholder="Описание шага"
              value={step.text} onChange={e => vm.setStepText(i, e.target.value)} />
            {vm.steps.length > 1 && (
              <button type="button" onClick={() => vm.removeStep(i)}
                className="text-red-400 hover:text-red-600 pt-2">✕</button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Время готовки (мин)</label>
          <input type="number" className="w-full border rounded px-3 py-2" min="1"
            value={vm.cookTimeMinutes} onChange={e => { vm.cookTimeMinutes = e.target.value }} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Порций</label>
          <input type="number" className="w-full border rounded px-3 py-2" min="1"
            value={vm.servings} onChange={e => { vm.servings = e.target.value }} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Теги (через запятую)</label>
        <input className="w-full border rounded px-3 py-2" placeholder="суп, украинская кухня"
          value={vm.tags} onChange={e => { vm.tags = e.target.value }} />
      </div>

      <button
        type="submit"
        disabled={vm.isSubmitting}
        className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {vm.isSubmitting ? 'Сохраняем...' : 'Сохранить рецепт'}
      </button>
    </form>
  )
})
