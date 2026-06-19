// src/modules/bot/handlers/draft.handler.ts
import { injectable, inject } from 'inversify'
import { RecipeDraftServiceToken, RecipeAssistantServiceToken } from '@/tokens/recipe-draft.tokens'
import { ImportHandlerToken, DraftRendererToken } from '../bot.tokens'
import type { IRecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service.interface'
import type { IRecipeAssistantService, TextClassificationResult } from '@/modules/recipe-drafts/services/recipe-assistant.service.interface'
import type { RecipeDraftEntity } from '@/modules/recipe-drafts/entities/recipe-draft.entity'
import type { DraftRenderer } from '../renderer/draft.renderer'
import type { IImportHandler } from './import.handler.interface'
import type { IDraftHandler } from './draft.handler.interface'
import type { SetStatus } from '../bot-adapter.interface'

const URL_REGEX = /https?:\/\/\S+/
const CLASSIFY_TIMEOUT_MS = 33_000

@injectable()
export class DraftHandler implements IDraftHandler {
  constructor(
    @inject(RecipeDraftServiceToken)     private readonly draftService: IRecipeDraftService,
    @inject(RecipeAssistantServiceToken) private readonly assistant: IRecipeAssistantService,
    @inject(ImportHandlerToken)          private readonly importHandler: IImportHandler,
    @inject(DraftRendererToken)          private readonly renderer: DraftRenderer,
  ) {}

  // ── Text ──────────────────────────────────────

  async handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    if (draft.pendingAction === 'waiting_for_video') {
      return this.handleVideoUrl(draft, text)
    }
    if (draft.pendingAction === 'waiting_for_step') {
      return this.handleStep(draft, text, setStatus)
    }
    if (draft.pendingAction === 'waiting_for_ingredient') {
      return this.handleIngredient(draft, text, setStatus)
    }
    return this.handleFreeText(draft, text, setStatus)
  }

  // ── Photo ─────────────────────────────────────

  async handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string> {
    const base64 = buffer.toString('base64')

    try {
      await setStatus?.('🔍 ИИ классифицирует фото...')
      let elapsed = 0
      const ticker = setInterval(() => { elapsed += 5; setStatus?.(`🔍 ИИ классифицирует фото... (${elapsed}с)`) }, 5000)

      let classification: Awaited<ReturnType<typeof this.assistant.classifyPhoto>>
      try {
        classification = await Promise.race([
          this.assistant.classifyPhoto(base64, mimeType, draft, caption),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('classifyPhoto timeout')), CLASSIFY_TIMEOUT_MS)),
        ])
      } finally {
        clearInterval(ticker)
      }

      if (classification.type === 'cover') {
        return (
          '🖼 ИИ определил: это фото готового блюда (обложка).\n\n' +
          '⚠️ Загрузка фото в хранилище пока не интегрирована в этом потоке. ' +
          'Используй кнопку «Прикрепить фото» после загрузки через веб-интерфейс.\n\n' +
          this.renderer.renderDraftText(draft)
        )
      }

      if (classification.type === 'step') {
        const step = draft.steps.find(s => s.order === classification.stepOrder)
        return (
          `📸 ИИ определил: фото к шагу ${classification.stepOrder}${step ? ` («${step.text.slice(0, 40)}…»)` : ''}.\n\n` +
          '⚠️ Прикрепление фото к шагам пока не поддерживается в данных.\n\n' +
          this.renderer.renderDraftText(draft)
        )
      }

      if (classification.type === 'recipe') {
        return this.applyExtractedRecipe(draft, classification.extracted, setStatus)
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'classifyPhoto timeout'
      console.error('[DraftHandler] classifyPhoto failed:', err)
      await setStatus?.(isTimeout
        ? '⚠️ ИИ не ответил вовремя, пробую распознать рецепт напрямую...'
        : '⚠️ Не удалось классифицировать фото, пробую распознать рецепт напрямую...'
      )
    }

    return this.importHandler.handlePhoto(buffer, mimeType, caption, setStatus)
  }

  // ── Private helpers ───────────────────────────

  private async handleVideoUrl(draft: RecipeDraftEntity, text: string): Promise<string> {
    if (!URL_REGEX.test(text)) return '🎬 Нужна ссылка (http/https). Попробуй ещё раз.'
    try {
      const updated = await this.draftService.attachVideoUrl(draft.id, text)
      await this.draftService.updateDraft(draft.id, { pendingAction: null })
      return `🎬 Видео добавлено!\n\n${this.renderer.renderDraftText(updated)}`
    } catch {
      return '❌ Не удалось добавить ссылку. Убедись, что это http/https ссылка.'
    }
  }

  private async handleStep(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    try {
      await setStatus?.('🤖 ИИ нормализует шаги...')
      const newSteps = await this.assistant.normalizeSteps(text, draft.steps.length)
      await setStatus?.('💾 Сохраняю шаги в черновик...')
      const updated = await this.draftService.updateDraft(draft.id, {
        steps: [...draft.steps, ...newSteps],
        pendingAction: null,
      })
      const addedText = newSteps.map(s => `${s.order}. ${s.text}`).join('\n')
      return (
        `✅ Добавлено ${newSteps.length} шаг(ов):\n${addedText}\n\n` +
        this.renderer.renderDraftText(updated) +
        await this.buildMissingSuggestion(updated)
      )
    } catch (err) {
      console.error('[DraftHandler] normalizeSteps failed:', err)
      return '❌ Не удалось обработать шаги. Попробуй переформулировать.'
    }
  }

  private async handleIngredient(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const added: Array<{ name: string; amount: string; unit: string }> = []
    const failed: string[] = []

    for (const line of lines) {
      try {
        await setStatus?.(`🤖 Разбираю: «${line.slice(0, 30)}»...`)
        added.push(await this.assistant.normalizeIngredient(line))
      } catch (err) {
        console.error('[DraftHandler] normalizeIngredient failed:', err)
        failed.push(line)
      }
    }

    if (!added.length) return '❌ Не удалось распознать ингредиенты. Попробуй формат: «200 г муки»'

    const updated = await this.draftService.updateDraft(draft.id, {
      ingredients: [...draft.ingredients, ...added],
      pendingAction: null,
    })
    const addedText = added.map(i => `• ${i.amount} ${i.unit} ${i.name}`.trim()).join('\n')
    const failedText = failed.length ? `\n\n⚠️ Не удалось распознать:\n${failed.join('\n')}` : ''
    return (
      `✅ Добавлено ${added.length} ингредиент(ов):\n${addedText}${failedText}\n\n` +
      this.renderer.renderDraftText(updated) +
      await this.buildMissingSuggestion(updated)
    )
  }

  private async handleFreeText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string> {
    try {
      await setStatus?.('🤖 ИИ анализирует сообщение...')
      let elapsed = 0
      const ticker = setInterval(() => { elapsed += 5; setStatus?.(`🤖 ИИ анализирует сообщение... (${elapsed}с)`) }, 5000)

      let result: TextClassificationResult
      try {
        result = await Promise.race([
          this.assistant.classifyText(text, draft),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('classifyText timeout')), 25_000)),
        ])
      } finally {
        clearInterval(ticker)
      }

      await setStatus?.('💾 Применяю изменения...')
      return this.applyClassificationResult(draft, result)
    } catch (err) {
      console.error('[DraftHandler] classifyText failed:', err)
      return (
        '🤖 Не смог автоматически распознать тип сообщения. ' +
        'Используй кнопки ниже чтобы уточнить что именно ты хочешь добавить.\n\n' +
        this.renderer.renderDraftText(draft)
      )
    }
  }

  private async applyClassificationResult(draft: RecipeDraftEntity, result: TextClassificationResult): Promise<string> {
    if (result.type === 'question' && result.answer) return `🤖 ${result.answer}`

    const patch: Partial<RecipeDraftEntity> = {}
    const lines: string[] = []

    if (result.steps?.length) { patch.steps = [...draft.steps, ...result.steps]; lines.push(`📝 Добавлено ${result.steps.length} шаг(ов)`) }
    if (result.ingredients?.length) { patch.ingredients = [...draft.ingredients, ...result.ingredients]; lines.push(`🥕 Добавлено ${result.ingredients.length} ингредиент(ов)`) }
    if (result.suggestion) {
      const s = result.suggestion
      if (s.cookTimeMinutes && !draft.cookTimeMinutes) { patch.cookTimeMinutes = s.cookTimeMinutes; lines.push(`⏱ Время готовки: ${s.cookTimeMinutes} мин`) }
      if (s.servings && !draft.servings) { patch.servings = s.servings; lines.push(`🍽 Порций: ${s.servings}`) }
      if (s.title && !draft.title) { patch.title = s.title; lines.push(`📌 Название: ${s.title}`) }
      if (s.tags?.length && !draft.tags.length) { patch.tags = s.tags; lines.push(`🏷 Теги: ${s.tags.join(', ')}`) }
    }

    if (!Object.keys(patch).length) return '🤔 Не удалось распознать что именно добавить. Попробуй использовать кнопки меню.'

    const updated = await this.draftService.updateDraft(draft.id, patch)
    return `✅ Обновлено:\n${lines.join('\n')}\n\n${this.renderer.renderDraftText(updated)}`
  }

  private async applyExtractedRecipe(
    draft: RecipeDraftEntity,
    extracted: Awaited<ReturnType<typeof this.assistant.classifyPhoto>> extends { type: 'recipe'; extracted: infer E } ? E : never,
    setStatus?: SetStatus,
  ): Promise<string> {
    await setStatus?.('📖 Извлекаю данные рецепта из фото...')
    const patch: Partial<RecipeDraftEntity> = {}
    const lines = ['📖 ИИ извлёк рецепт из фото:']

    if (extracted.title && !draft.title) { patch.title = extracted.title; lines.push(`• Название: ${extracted.title}`) }
    if (extracted.ingredients.length) { patch.ingredients = [...draft.ingredients, ...extracted.ingredients]; lines.push(`• Ингредиентов: ${extracted.ingredients.length}`) }
    if (extracted.steps.length) {
      patch.steps = [...draft.steps, ...extracted.steps.map((s, i) => ({ order: draft.steps.length + i + 1, text: s.text }))]
      lines.push(`• Шагов: ${extracted.steps.length}`)
    }
    if (extracted.cookTimeMinutes && !draft.cookTimeMinutes) { patch.cookTimeMinutes = extracted.cookTimeMinutes; lines.push(`• Время: ${extracted.cookTimeMinutes} мин`) }
    if (extracted.servings && !draft.servings) { patch.servings = extracted.servings; lines.push(`• Порций: ${extracted.servings}`) }

    if (!Object.keys(patch).length) return '🤔 Не удалось извлечь данные из фото рецепта.'

    await setStatus?.('💾 Сохраняю в черновик...')
    await this.draftService.updateDraft(draft.id, { ...patch, pendingAction: null })
    const updated = await this.draftService.getActiveDraft('telegram', draft.channelChatId, draft.channelUserId)
    return lines.join('\n') + '\n\n' + this.renderer.renderDraftText(updated ?? draft)
  }

  private async buildMissingSuggestion(draft: RecipeDraftEntity): Promise<string> {
    try {
      const suggestions = await this.assistant.suggestMissingFields(draft)
      if (!suggestions.length) return ''
      return `\n\n💡 ИИ может заполнить недостающее:\n${suggestions.map(s => `• ${s.suggestion}`).join('\n')}\n(нажми «Заполнить недостающее»)`
    } catch {
      return ''
    }
  }
}
