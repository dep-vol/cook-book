import { injectable, inject } from 'inversify'
import { ImportJobRepositoryToken, RecipeParserToken } from '@/tokens/import-job.tokens'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { UrlScraperToken } from '@/tokens/url-scraper.tokens'
import { uploadImage } from '@/lib/minio'
import type { IImportJobRepository } from '../repositories/import-job.repository.interface'
import type { IRecipeParser } from './recipe-parser.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'
import type { IImportJobService } from './import-job.service.interface'
import type { ImportJobEntity } from '../entities/import-job.entity'
import type { IUrlScraper } from '@/modules/url-scraper/url-scraper.interface'

@injectable()
export class ImportJobService implements IImportJobService {
  constructor(
    @inject(ImportJobRepositoryToken) private readonly repo: IImportJobRepository,
    @inject(RecipeParserToken) private readonly parser: IRecipeParser,
    @inject(RecipeServiceToken) private readonly recipeService: IRecipeService,
    @inject(UrlScraperToken) private readonly scraper: IUrlScraper,
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

  async importFromTextWithPhoto(text: string, photoBuffer: Buffer, mimeType: string): Promise<ImportJobEntity> {
    const job = await this.repo.create({ sourceType: 'photo', rawInput: text })
    try {
      await this.repo.updateStatus(job.id, 'processing')
      const [parsed, imageKey] = await Promise.all([
        this.parser.parseText(text),
        uploadImage(photoBuffer, mimeType),
      ])
      const recipe = await this.recipeService.create({ ...parsed, sourceUrl: null, imageKey })
      await this.repo.updateStatus(job.id, 'done', { recipeId: recipe.id })
      return { ...job, status: 'done', recipeId: recipe.id }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      await this.repo.updateStatus(job.id, 'failed', { error })
      return { ...job, status: 'failed', error }
    }
  }

  async importFromUrl(url: string): Promise<ImportJobEntity> {
    const job = await this.repo.create({ sourceType: 'url', rawInput: url })
    try {
      await this.repo.updateStatus(job.id, 'processing')
      const { text, imageUrl } = await this.scraper.scrape(url)
      const parsed = await this.parser.parseText(text)

      let imageKey: string | null = null
      if (imageUrl) {
        const imgRes = await fetch(new URL(imageUrl, url).href)
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer())
          const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg'
          imageKey = await uploadImage(buffer, mimeType)
        }
      }

      const recipe = await this.recipeService.create({ ...parsed, sourceUrl: url, imageKey })
      await this.repo.updateStatus(job.id, 'done', { recipeId: recipe.id })
      return { ...job, status: 'done', recipeId: recipe.id }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      await this.repo.updateStatus(job.id, 'failed', { error })
      return { ...job, status: 'failed', error }
    }
  }
}
