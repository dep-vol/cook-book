import 'reflect-metadata'
import { Container } from 'inversify'
import { RecipeRepositoryToken, RecipeServiceToken } from '@/tokens/recipe.tokens'
import { RecipeDraftRepositoryToken, RecipeDraftServiceToken, DraftRefinementServiceToken } from '@/tokens/recipe-draft.tokens'
import { RecipeAssistantServiceToken } from '@/tokens/recipe-draft.tokens'
import { ImportJobRepositoryToken, ImportJobServiceToken, RecipeParserToken } from '@/tokens/import-job.tokens'
import { UrlScraperToken } from '@/tokens/url-scraper.tokens'
import { RecipeRepository } from '@/modules/recipes/repositories/recipe.repository'
import { RecipeService } from '@/modules/recipes/services/recipe.service'
import { RecipeDraftRepository } from '@/modules/recipe-drafts/repositories/recipe-draft.repository'
import { RecipeDraftService } from '@/modules/recipe-drafts/services/recipe-draft.service'
import { RecipeAssistantService } from '@/modules/recipe-drafts/services/recipe-assistant.service'
import { DraftRefinementService } from '@/modules/recipe-drafts/services/draft-refinement.service'
import { ImportJobRepository } from '@/modules/import-jobs/repositories/import-job.repository'
import { ImportJobService } from '@/modules/import-jobs/services/import-job.service'
import { RecipeParser } from '@/modules/import-jobs/services/recipe-parser.service'
import { LLMService } from '@/modules/import-jobs/services/llm.service'
import { LLMServiceToken } from '@/tokens/import-job.tokens'
import { CheerioScraper } from '@/modules/url-scraper/cheerio.scraper'
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken, DraftRendererToken } from '@/modules/bot/bot.tokens'
import { DraftHandler } from '@/modules/bot/handlers/draft.handler'
import { ImportHandler } from '@/modules/bot/handlers/import.handler'
import { CallbackHandler } from '@/modules/bot/handlers/callback.handler'
import { DraftRenderer } from '@/modules/bot/renderer/draft.renderer'
import { TextSourceToken, PhotoSourceToken, UrlSourceToken, VideoSourceToken, RecipeExtractorToken, RecognitionServiceToken } from '@/modules/recognition/recognition.tokens'
import { TextSource } from '@/modules/recognition/sources/text.source'
import { PhotoSource } from '@/modules/recognition/sources/photo.source'
import { UrlSource } from '@/modules/recognition/sources/url.source'
import { VideoSource } from '@/modules/recognition/sources/video.source'
import { RecipeExtractor } from '@/modules/recognition/extractor/recipe-extractor'
import { RecognitionService } from '@/modules/recognition/recognition.service'

export const container = new Container()

container.bind(RecipeRepositoryToken).to(RecipeRepository).inSingletonScope()
container.bind(RecipeServiceToken).to(RecipeService).inSingletonScope()
container.bind(RecipeDraftRepositoryToken).to(RecipeDraftRepository).inSingletonScope()
container.bind(RecipeDraftServiceToken).to(RecipeDraftService).inSingletonScope()
container.bind(RecipeAssistantServiceToken).to(RecipeAssistantService).inSingletonScope()
container.bind(DraftRefinementServiceToken).to(DraftRefinementService).inSingletonScope()
container.bind(ImportJobRepositoryToken).to(ImportJobRepository).inSingletonScope()
container.bind(LLMServiceToken).to(LLMService).inSingletonScope()
container.bind(RecipeParserToken).to(RecipeParser).inSingletonScope()
container.bind(UrlScraperToken).to(CheerioScraper).inSingletonScope()
container.bind(ImportJobServiceToken).to(ImportJobService).inSingletonScope()

container.bind(DraftRendererToken).to(DraftRenderer).inSingletonScope()
container.bind(ImportHandlerToken).to(ImportHandler).inSingletonScope()
container.bind(CallbackHandlerToken).to(CallbackHandler).inSingletonScope()
container.bind(DraftHandlerToken).to(DraftHandler).inSingletonScope()

container.bind(TextSourceToken).to(TextSource).inSingletonScope()
container.bind(PhotoSourceToken).to(PhotoSource).inSingletonScope()
container.bind(UrlSourceToken).to(UrlSource).inSingletonScope()
container.bind(VideoSourceToken).to(VideoSource).inSingletonScope()
container.bind(RecipeExtractorToken).to(RecipeExtractor).inSingletonScope()
container.bind(RecognitionServiceToken).to(RecognitionService).inSingletonScope()

