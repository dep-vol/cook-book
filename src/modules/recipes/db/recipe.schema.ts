import { pgTable, uuid, text, integer, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core'

export const importStatusEnum = pgEnum('import_status', ['pending', 'processing', 'done', 'failed'])
export const sourceTypeEnum = pgEnum('source_type', ['photo', 'text', 'url', 'video'])
export const recipeDraftStateEnum = pgEnum('recipe_draft_state', ['editing', 'confirming', 'saved', 'expired'])
export const recipeDraftSourceTypeEnum = pgEnum('recipe_draft_source_type', ['manual', 'text', 'photo', 'url', 'video'])

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
  videoUrl: text('video_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recipeDrafts = pgTable(
  'recipe_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').notNull().default('telegram'),
    channelChatId: text('channel_chat_id').notNull(),
    channelUserId: text('channel_user_id').notNull(),
    state: recipeDraftStateEnum('state').notNull().default('editing'),
    sourceType: recipeDraftSourceTypeEnum('source_type').notNull(),
    title: text('title'),
    ingredients: jsonb('ingredients').notNull().$type<Array<{ name: string; amount: string; unit: string }>>().default([]),
    steps: jsonb('steps').notNull().$type<Array<{ order: number; text: string }>>().default([]),
    cookTimeMinutes: integer('cook_time_minutes'),
    servings: integer('servings'),
    tags: text('tags').array().notNull().default([]),
    sourceText: text('source_text'),
    sourceUrl: text('source_url'),
    coverImageKey: text('cover_image_key'),
    videoUrl: text('video_url'),
    lastAiSuggestion: jsonb('last_ai_suggestion').$type<unknown>(),
    pendingAction: text('pending_action'),
    pendingSource: jsonb('pending_source').$type<unknown>(),
    recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('recipe_drafts_active_lookup_idx').on(
      table.channel,
      table.channelChatId,
      table.channelUserId,
      table.state,
      table.expiresAt
    ),
  ]
)

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: importStatusEnum('status').notNull().default('pending'),
  sourceType: sourceTypeEnum('source_type').notNull(),
  rawInput: text('raw_input').notNull(),
  recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  draftId: uuid('draft_id').references(() => recipeDrafts.id, { onDelete: 'set null' }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type RecipeRow = typeof recipes.$inferSelect
export type NewRecipeRow = typeof recipes.$inferInsert
export type ImportJobRow = typeof importJobs.$inferSelect
export type RecipeDraftRow = typeof recipeDrafts.$inferSelect
