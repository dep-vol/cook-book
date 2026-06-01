import type { ImportJobEntity } from '../entities/import-job.entity'

export interface IImportJobService {
  importFromText(text: string): Promise<ImportJobEntity>
  importFromPhoto(photoBuffer: Buffer, mimeType: string): Promise<ImportJobEntity>
  importFromUrl(url: string): Promise<ImportJobEntity>
  importFromTextWithPhoto(text: string, photoBuffer: Buffer, mimeType: string): Promise<ImportJobEntity>
}
