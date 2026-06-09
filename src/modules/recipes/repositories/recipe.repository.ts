import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { recipes, type RecipeRow } from '@/modules/recipes/db/recipe.schema'
import type { IRecipeRepository } from './recipe.repository.interface'
import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'
import { injectable } from 'inversify'

@injectable()
export class RecipeRepository implements IRecipeRepository {
  private mapToEntity(row: RecipeRow): RecipeEntity {
    return {
      id: row.id,
      title: row.title,
      ingredients: row.ingredients as RecipeEntity['ingredients'],
      steps: row.steps as RecipeEntity['steps'],
      cookTimeMinutes: row.cookTimeMinutes,
      servings: row.servings,
      tags: row.tags,
      sourceUrl: row.sourceUrl,
      imageKey: row.imageKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async findAll(): Promise<RecipeEntity[]> {
    const rows = await db.select().from(recipes).orderBy(recipes.createdAt)
    return rows.map((row) => this.mapToEntity(row))
  }

  async findById(id: string): Promise<RecipeEntity | null> {
    const rows = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1)
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async create(data: CreateRecipeDTO): Promise<RecipeEntity> {
    const rows = await db
      .insert(recipes)
      .values({
        title: data.title,
        ingredients: data.ingredients,
        steps: data.steps,
        cookTimeMinutes: data.cookTimeMinutes ?? null,
        servings: data.servings ?? null,
        tags: data.tags,
        sourceUrl: data.sourceUrl ?? null,
        imageKey: data.imageKey ?? null,
      })
      .returning()
    return this.mapToEntity(rows[0])
  }

  async update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity | null> {
    const updateData: Partial<typeof recipes.$inferInsert> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.ingredients !== undefined) updateData.ingredients = data.ingredients
    if (data.steps !== undefined) updateData.steps = data.steps
    if (data.cookTimeMinutes !== undefined) updateData.cookTimeMinutes = data.cookTimeMinutes
    if (data.servings !== undefined) updateData.servings = data.servings
    if (data.tags !== undefined) updateData.tags = data.tags
    if (data.sourceUrl !== undefined) updateData.sourceUrl = data.sourceUrl ?? null
    updateData.updatedAt = new Date()

    const rows = await db.update(recipes).set(updateData).where(eq(recipes.id, id)).returning()
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async delete(id: string): Promise<void> {
    await db.delete(recipes).where(eq(recipes.id, id))
  }

  async deleteSeveral(ids: string[]): Promise<void> {
    await db.delete(recipes).where(inArray(recipes.id, ids))
  }
}
