import { pgTable, uuid, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'

export const importStatusEnum = pgEnum('import_status', ['pending', 'processing', 'done', 'failed'])
export const sourceTypeEnum = pgEnum('source_type', ['photo', 'text', 'url'])

export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  ingredients: jsonb('ingredients').notNull().$type<Array<{ name: string; amount: string; unit: string }>>(),
  steps: jsonb('steps').notNull().$type<Array<{ order: number; text: string }>>(),
  cookTimeMinutes: integer('cook_time_minutes'),
  servings: integer('servings'),
  tags: text('tags').array().notNull().default([]),
  sourceUrl: text('source_url'),
  imageKey: text('image_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: importStatusEnum('status').notNull().default('pending'),
  sourceType: sourceTypeEnum('source_type').notNull(),
  rawInput: text('raw_input').notNull(),
  recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type RecipeRow = typeof recipes.$inferSelect
export type NewRecipeRow = typeof recipes.$inferInsert
