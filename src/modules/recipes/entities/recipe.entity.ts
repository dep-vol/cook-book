export interface Ingredient {
  name: string
  amount: string
  unit: string
}

export interface Step {
  order: number
  text: string
}

// RecipeEntity — доменный объект. Только то, что нужно бизнес-логике.
// Никаких HTTP-деталей, никаких snake_case.
export interface RecipeEntity {
  id: string
  title: string
  ingredients: Ingredient[]
  steps: Step[]
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
  sourceUrl: string | null
  imageKey: string | null
  videoUrl: string | null
  createdAt: Date
  updatedAt: Date
}
