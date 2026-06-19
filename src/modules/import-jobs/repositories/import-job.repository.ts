import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { importJobs } from '@/modules/recipes/db/recipe.schema'
import type { ImportJobRow } from '@/modules/recipes/db/recipe.schema'
import type { IImportJobRepository } from './import-job.repository.interface'
import type { ImportJobEntity, ImportStatus, SourceType } from '../entities/import-job.entity'

export class ImportJobRepository implements IImportJobRepository {
  private mapToEntity(row: ImportJobRow): ImportJobEntity {
    return {
      id: row.id,
      status: row.status as ImportStatus,
      sourceType: row.sourceType as SourceType,
      rawInput: row.rawInput,
      recipeId: row.recipeId ?? null,
      draftId: row.draftId ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
    }
  }

  async create(data: { sourceType: SourceType; rawInput: string; draftId?: string }): Promise<ImportJobEntity> {
    const rows = await db
      .insert(importJobs)
      .values({
        sourceType: data.sourceType,
        rawInput: data.rawInput,
        ...(data.draftId !== undefined ? { draftId: data.draftId } : {}),
      })
      .returning()
    return this.mapToEntity(rows[0])
  }

  async findById(id: string): Promise<ImportJobEntity | null> {
    const rows = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1)
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async updateStatus(
    id: string,
    status: ImportStatus,
    opts?: { recipeId?: string; draftId?: string; error?: string }
  ): Promise<void> {
    await db
      .update(importJobs)
      .set({
        status,
        ...(opts?.recipeId !== undefined ? { recipeId: opts.recipeId } : {}),
        ...(opts?.draftId !== undefined ? { draftId: opts.draftId } : {}),
        ...(opts?.error !== undefined ? { error: opts.error } : {}),
      })
      .where(eq(importJobs.id, id))
  }
}
