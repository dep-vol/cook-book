import type { ServiceIdentifier } from 'inversify'
import type { IRecognitionSource } from './sources/source.interface'
import type { IRecipeExtractor } from './extractor/recipe-extractor.interface'
import type { IRecognitionService } from './recognition.service.interface'

export const TextSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('TextSource')
export const PhotoSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('PhotoSource')
export const UrlSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('UrlSource')
export const VideoSourceToken: ServiceIdentifier<IRecognitionSource> = Symbol.for('VideoSource')

export const RecipeExtractorToken: ServiceIdentifier<IRecipeExtractor> = Symbol.for('RecipeExtractor')

export const RecognitionServiceToken: ServiceIdentifier<IRecognitionService> = Symbol.for('RecognitionService')
