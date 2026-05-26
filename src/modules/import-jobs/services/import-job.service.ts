import { injectable, inject } from 'inversify'
import { ImportJobRepositoryToken, RecipeParserToken } from '@/tokens/import-job.tokens'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import type { IImportJobRepository } from '../repositories/import-job.repository.interface'
import type { IRecipeParser } from './recipe-parser.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { IImportJobService } from './import-job.service.interface'
import type { ImportJobEntity } from '../entities/import-job.entity'

@injectable()
export class ImportJobService implements IImportJobService {
  constructor(
    @inject(ImportJobRepositoryToken) private readonly repo: IImportJobRepository,
    @inject(RecipeParserToken) private readonly parser: IRecipeParser,
    @inject(RecipeServiceToken) private readonly recipeService: IRecipeService,
  ) {}

  async importFromText(text: string): Promise<ImportJobEntity> {
    const job = await this.repo.create({ sourceType: 'text', rawInput: text })
    try {
      await this.repo.updateStatus(job.id, 'processing')
      const parsed = await this.parser.parseText(text)
      const recipe = await this.recipeService.create({ ...parsed, sourceUrl: null })
      await this.repo.updateStatus(job.id, 'done', { recipeId: recipe.id })
      return { ...job, status: 'done', recipeId: recipe.id }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      await this.repo.updateStatus(job.id, 'failed', { error })
      return { ...job, status: 'failed', error }
    }
  }

  async importFromPhoto(photoBuffer: Buffer, mimeType: string): Promise<ImportJobEntity> {
    const base64 = photoBuffer.toString('base64')
    const job = await this.repo.create({ sourceType: 'photo', rawInput: base64 })
    try {
      await this.repo.updateStatus(job.id, 'processing')
      const parsed = await this.parser.parsePhoto(base64, mimeType)
      const recipe = await this.recipeService.create({ ...parsed, sourceUrl: null })
      await this.repo.updateStatus(job.id, 'done', { recipeId: recipe.id })
      return { ...job, status: 'done', recipeId: recipe.id }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      await this.repo.updateStatus(job.id, 'failed', { error })
      return { ...job, status: 'failed', error }
    }
  }
}
