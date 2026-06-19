import { inject, injectable } from 'inversify'
import { uploadImage } from '@/lib/minio'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { ImportJobRepositoryToken } from '@/tokens/import-job.tokens'
import { TextSourceToken, PhotoSourceToken, UrlSourceToken, VideoSourceToken, RecipeExtractorToken } from './recognition.tokens'
import type { IRecognitionSource, NormalizedContent, RecognitionInput } from './sources/source.interface'
import type { IRecipeExtractor, ExtractedRecipe } from './extractor/recipe-extractor.interface'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository.interface'
import type { RecipeDraftEntity, RecipeDraftSourceType } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { IRecognitionService, RecognitionContext } from './recognition.service.interface'
import { isVideoUrl } from './sources/source.interface'

@injectable()
export class RecognitionService implements IRecognitionService {
  private readonly sources: IRecognitionSource[]

  constructor(
    @inject(TextSourceToken) text: IRecognitionSource,
    @inject(PhotoSourceToken) photo: IRecognitionSource,
    @inject(UrlSourceToken) url: IRecognitionSource,
    @inject(VideoSourceToken) video: IRecognitionSource,
    @inject(RecipeExtractorToken) private readonly extractor: IRecipeExtractor,
    @inject(RecipeDraftServiceToken) private readonly drafts: IRecipeDraftService,
    @inject(ImportJobRepositoryToken) private readonly jobs: IImportJobRepository,
  ) {
    // порядок важен: video и url оба обрабатывают kind 'url'; video.detect отсеивает по хосту
    this.sources = [text, photo, video, url]
  }

  async toContent(input: RecognitionInput): Promise<NormalizedContent> {
    const source = this.sources.find(s => s.detect(input))
    if (!source) throw new Error(`No recognition source for input kind: ${input.kind}`)
    return source.extract(input)
  }

  async recognize(input: RecognitionInput, ctx: RecognitionContext): Promise<RecipeDraftEntity> {
    const sourceType = this.sourceTypeOf(input)
    const job = await this.jobs.create({ sourceType, rawInput: this.rawInputOf(input) })
    try {
      const content = await this.toContent(input)
      const draft = await this.createDraftFromContent(content, sourceType, ctx)
      await this.jobs.updateStatus(job.id, 'done', { draftId: draft.id })
      return draft
    } catch (err) {
      await this.jobs.updateStatus(job.id, 'failed', { error: err instanceof Error ? err.message : 'Unknown error' })
      throw err
    }
  }

  async createDraftFromContent(content: NormalizedContent, sourceType: RecipeDraftSourceType, ctx: RecognitionContext): Promise<RecipeDraftEntity> {
    const extracted = await this.extractor.extract(content)
    const draft = await this.drafts.createDraft({
      channel: ctx.channel, channelChatId: ctx.chatId, channelUserId: ctx.userId, sourceType,
    })
    const coverImageKey = await this.uploadCover(content)
    return this.drafts.updateDraft(draft.id, {
      ...this.toPatch(extracted),
      sourceText: content.text ?? null,
      sourceUrl: content.sourceUrl ?? null,
      coverImageKey,
    })
  }

  async mergeContentIntoDraft(draft: RecipeDraftEntity, content: NormalizedContent): Promise<{ draft: RecipeDraftEntity; summary: string }> {
    const extracted = await this.extractor.extract(content)
    const lines: string[] = []
    const patch: Partial<RecipeDraftEntity> = {}

    if (extracted.ingredients.length) {
      patch.ingredients = [...draft.ingredients, ...extracted.ingredients]
      lines.push(`🥕 +${extracted.ingredients.length} ингредиент(ов)`)
    }
    if (extracted.steps.length) {
      patch.steps = [...draft.steps, ...extracted.steps.map((s, i) => ({ order: draft.steps.length + i + 1, text: s.text }))]
      lines.push(`📝 +${extracted.steps.length} шаг(ов)`)
    }
    if (extracted.title && !draft.title) { patch.title = extracted.title; lines.push(`📌 Название: ${extracted.title}`) }
    if (extracted.cookTimeMinutes && !draft.cookTimeMinutes) { patch.cookTimeMinutes = extracted.cookTimeMinutes; lines.push(`⏱ ${extracted.cookTimeMinutes} мин`) }
    if (extracted.servings && !draft.servings) { patch.servings = extracted.servings; lines.push(`🍽 ${extracted.servings} порц.`) }
    if (extracted.tags.length && !draft.tags.length) { patch.tags = extracted.tags; lines.push(`🏷 ${extracted.tags.join(', ')}`) }

    const cover = draft.coverImageKey ? null : await this.uploadCover(content)
    if (cover) patch.coverImageKey = cover

    const updated = Object.keys(patch).length ? await this.drafts.updateDraft(draft.id, patch) : draft
    return { draft: updated, summary: lines.length ? lines.join('\n') : 'Нечего добавить из этого источника.' }
  }

  private toPatch(e: ExtractedRecipe): Partial<RecipeDraftEntity> {
    return {
      title: e.title, ingredients: e.ingredients, steps: e.steps,
      cookTimeMinutes: e.cookTimeMinutes, servings: e.servings, tags: e.tags,
    }
  }

  private async uploadCover(content: NormalizedContent): Promise<string | null> {
    try {
      if (content.coverImageUrl) {
        const res = await fetch(content.coverImageUrl)
        if (!res.ok) return null
        const buffer = Buffer.from(await res.arrayBuffer())
        return uploadImage(buffer, res.headers.get('content-type') ?? 'image/jpeg')
      }
      if (content.images?.length) {
        const [img] = content.images
        return uploadImage(Buffer.from(img.base64, 'base64'), img.mimeType)
      }
    } catch {
      return null
    }
    return null
  }

  private sourceTypeOf(input: RecognitionInput): RecipeDraftSourceType {
    if (input.kind === 'text') return 'text'
    if (input.kind === 'photo') return 'photo'
    return isVideoUrl(input.url) ? 'video' : 'url'
  }

  private rawInputOf(input: RecognitionInput): string {
    if (input.kind === 'text') return input.text
    if (input.kind === 'url') return input.url
    return input.caption ?? '[photo]'
  }
}
