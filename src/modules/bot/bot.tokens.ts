// src/modules/bot/bot.tokens.ts
import type { ServiceIdentifier } from 'inversify'
import type { IDraftHandler } from './handlers/draft.handler.interface'
import type { ICallbackHandler } from './handlers/callback.handler.interface'
import type { DraftRenderer } from './renderer/draft.renderer'

export const DraftHandlerToken: ServiceIdentifier<IDraftHandler> = Symbol.for('DraftHandler')
export const CallbackHandlerToken: ServiceIdentifier<ICallbackHandler> = Symbol.for('CallbackHandler')
export const DraftRendererToken: ServiceIdentifier<DraftRenderer> = Symbol.for('DraftRenderer')
