import { and, desc, eq, gt, inArray, not } from 'drizzle-orm'
import { injectable } from 'inversify'
import { db } from '@/lib/db'
import { recipeDrafts, type RecipeDraftRow } from '@/modules/recipes/db/recipe.schema'
import type { DraftPendingAction, RecipeDraftEntity, RecipeDraftSourceType } from '../entities/recipe-draft.entity'
import type { IRecipeDraftRepository } from './recipe-draft.repository.interface'

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

@injectable()
export class RecipeDraftRepository implements IRecipeDraftRepository {
  private mapToEntity(row: RecipeDraftRow): RecipeDraftEntity {
    return {
      id: row.id,
      channel: row.channel,
      channelChatId: row.channelChatId,
      channelUserId: row.channelUserId,
      state: row.state,
      sourceType: row.sourceType,
      title: row.title,
      ingredients: row.ingredients as RecipeDraftEntity['ingredients'],
      steps: row.steps as RecipeDraftEntity['steps'],
      cookTimeMinutes: row.cookTimeMinutes,
      servings: row.servings,
      tags: row.tags,
      sourceText: row.sourceText,
      sourceUrl: row.sourceUrl,
      coverImageKey: row.coverImageKey,
      videoUrl: row.videoUrl,
      lastAiSuggestion: row.lastAiSuggestion ?? null,
      pendingAction: (row.pendingAction as DraftPendingAction | null) ?? null,
      recipeId: row.recipeId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt,
    }
  }

  async create(data: {
    channel: string
    channelChatId: string
    channelUserId: string
    sourceType: RecipeDraftSourceType
  }): Promise<RecipeDraftEntity> {
    const now = new Date()
    const rows = await db
      .insert(recipeDrafts)
      .values({
        channel: data.channel,
        channelChatId: data.channelChatId,
        channelUserId: data.channelUserId,
        sourceType: data.sourceType,
        state: 'editing',
        title: null,
        ingredients: [],
        steps: [],
        cookTimeMinutes: null,
        servings: null,
        tags: [],
        sourceText: null,
        sourceUrl: null,
        coverImageKey: null,
        videoUrl: null,
        lastAiSuggestion: null,
        recipeId: null,
        expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
      })
      .returning()
    return this.mapToEntity(rows[0])
  }

  async findById(id: string): Promise<RecipeDraftEntity | null> {
    const rows = await db.select().from(recipeDrafts).where(eq(recipeDrafts.id, id)).limit(1)
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async findActiveDraft(channel: string, chatId: string, userId: string): Promise<RecipeDraftEntity | null> {
    const rows = await db
      .select()
      .from(recipeDrafts)
      .where(
        and(
          eq(recipeDrafts.channel, channel),
          eq(recipeDrafts.channelChatId, chatId),
          eq(recipeDrafts.channelUserId, userId),
          not(inArray(recipeDrafts.state, ['saved', 'expired'])),
          gt(recipeDrafts.expiresAt, new Date())
        )
      )
      .orderBy(desc(recipeDrafts.createdAt))
      .limit(1)
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async update(id: string, patch: Partial<RecipeDraftEntity>): Promise<RecipeDraftEntity> {
    const updateData: Partial<typeof recipeDrafts.$inferInsert> = {}
    if (patch.channel !== undefined) updateData.channel = patch.channel
    if (patch.channelChatId !== undefined) updateData.channelChatId = patch.channelChatId
    if (patch.channelUserId !== undefined) updateData.channelUserId = patch.channelUserId
    if (patch.state !== undefined) updateData.state = patch.state
    if (patch.sourceType !== undefined) updateData.sourceType = patch.sourceType
    if (patch.title !== undefined) updateData.title = patch.title
    if (patch.ingredients !== undefined) updateData.ingredients = patch.ingredients
    if (patch.steps !== undefined) updateData.steps = patch.steps
    if (patch.cookTimeMinutes !== undefined) updateData.cookTimeMinutes = patch.cookTimeMinutes
    if (patch.servings !== undefined) updateData.servings = patch.servings
    if (patch.tags !== undefined) updateData.tags = patch.tags
    if (patch.sourceText !== undefined) updateData.sourceText = patch.sourceText
    if (patch.sourceUrl !== undefined) updateData.sourceUrl = patch.sourceUrl
    if (patch.coverImageKey !== undefined) updateData.coverImageKey = patch.coverImageKey
    if (patch.videoUrl !== undefined) updateData.videoUrl = patch.videoUrl
    if (patch.lastAiSuggestion !== undefined) updateData.lastAiSuggestion = patch.lastAiSuggestion
    if (patch.pendingAction !== undefined) updateData.pendingAction = patch.pendingAction
    if (patch.recipeId !== undefined) updateData.recipeId = patch.recipeId
    if (patch.expiresAt !== undefined) updateData.expiresAt = patch.expiresAt
    updateData.updatedAt = new Date()

    const rows = await db.update(recipeDrafts).set(updateData).where(eq(recipeDrafts.id, id)).returning()
    if (!rows[0]) throw new Error(`Recipe draft not found: ${id}`)
    return this.mapToEntity(rows[0])
  }

  async markSaved(id: string, recipeId: string): Promise<RecipeDraftEntity> {
    return this.update(id, { state: 'saved', recipeId })
  }

  async delete(id: string): Promise<void> {
    await db.delete(recipeDrafts).where(eq(recipeDrafts.id, id))
  }
}
