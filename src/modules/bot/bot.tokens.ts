// src/modules/bot/bot.tokens.ts
import type { ServiceIdentifier } from 'inversify'
import type { IDraftHandler }     from './handlers/draft.handler.interface'
import type { IImportHandler }    from './handlers/import.handler.interface'
import type { ICallbackHandler }  from './handlers/callback.handler.interface'

export const DraftHandlerToken:    ServiceIdentifier<IDraftHandler>    = Symbol.for('DraftHandler')
export const ImportHandlerToken:   ServiceIdentifier<IImportHandler>   = Symbol.for('ImportHandler')
export const CallbackHandlerToken: ServiceIdentifier<ICallbackHandler> = Symbol.for('CallbackHandler')
export const DraftRendererToken:   ServiceIdentifier<unknown>          = Symbol.for('DraftRenderer')
