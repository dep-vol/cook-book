import type { ImportJobEntity, ImportStatus, SourceType } from '../entities/import-job.entity'

export interface IImportJobRepository {
  create(data: { sourceType: SourceType; rawInput: string }): Promise<ImportJobEntity>
  findById(id: string): Promise<ImportJobEntity | null>
  updateStatus(
    id: string,
    status: ImportStatus,
    opts?: { recipeId?: string; error?: string }
  ): Promise<void>
}
