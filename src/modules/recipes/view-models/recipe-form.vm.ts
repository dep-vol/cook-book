import { makeAutoObservable, runInAction } from 'mobx'
import type { CreateRecipeDTO } from '../transport/recipe.dto'
import type { Ingredient, Step } from '../entities/recipe.entity'

// ViewModel управляет состоянием экрана.
// Не знает про HTTP, не знает про Server Actions напрямую —
// получает коллбэк onSubmit через конструктор.

export class RecipeFormViewModel {
  title = ''
  ingredients: Ingredient[] = [{ name: '', amount: '', unit: '' }]
  steps: Step[] = [{ order: 1, text: '' }]
  cookTimeMinutes = ''
  servings = ''
  tags = ''
  isSubmitting = false
  error: string | null = null

  constructor(
    private readonly onSubmit: (data: CreateRecipeDTO) => Promise<void>,
    initialData?: Partial<CreateRecipeDTO>
  ) {
    makeAutoObservable(this)
    if (initialData) {
      this.title = initialData.title ?? ''
      this.ingredients = initialData.ingredients ?? [{ name: '', amount: '', unit: '' }]
      this.steps = initialData.steps ?? [{ order: 1, text: '' }]
      this.cookTimeMinutes = initialData.cookTimeMinutes?.toString() ?? ''
      this.servings = initialData.servings?.toString() ?? ''
      this.tags = initialData.tags?.join(', ') ?? ''
    }
  }

  setTitle(value: string) { this.title = value }
  setIngredientField(index: number, field: keyof Ingredient, value: string) {
    this.ingredients[index][field] = value
  }
  setStepText(index: number, value: string) {
    this.steps[index].text = value
  }

  addIngredient() {
    this.ingredients.push({ name: '', amount: '', unit: '' })
  }
  removeIngredient(index: number) {
    this.ingredients.splice(index, 1)
  }

  addStep() {
    this.steps.push({ order: this.steps.length + 1, text: '' })
  }
  removeStep(index: number) {
    this.steps.splice(index, 1)
    this.steps.forEach((s, i) => { s.order = i + 1 })
  }

  async submit() {
    this.isSubmitting = true
    this.error = null
    try {
      await this.onSubmit({
        title: this.title,
        ingredients: this.ingredients,
        steps: this.steps,
        cookTimeMinutes: this.cookTimeMinutes ? Number(this.cookTimeMinutes) : null,
        servings: this.servings ? Number(this.servings) : null,
        tags: this.tags.split(',').map(t => t.trim()).filter(Boolean),
        sourceUrl: null,
      })
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Произошла ошибка'
      })
    } finally {
      runInAction(() => { this.isSubmitting = false })
    }
  }
}
