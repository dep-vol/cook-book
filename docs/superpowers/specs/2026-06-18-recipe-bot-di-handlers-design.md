# Recipe Bot — DI-based Handler Architecture

**Date:** 2026-06-18  
**Status:** Approved  
**Scope:** `src/modules/bot/`

---

## Problem

After the recent decomposition, bot logic lives in standalone functions spread across `draft-text-handler.ts`, `draft-photo-handler.ts`, `draft-callbacks.ts`, `draft-renderer.ts`. These functions receive service bundles as plain object parameters, which means:

- No DI — `RecipeBot` manually wires service objects into function calls
- Not testable in isolation without passing full service mocks
- No clear ownership — functions from different files can import each other freely
- Inconsistent with the rest of the project (InversifyJS throughout)

---

## Goal

Introduce domain-oriented handler classes with explicit interfaces, registered in the InversifyJS container. `RecipeBot` depends only on abstractions.

---

## File Structure

```
src/modules/bot/
├── bot.tokens.ts                          ← all bot-module DI tokens
├── bot-adapter.interface.ts               (unchanged)
├── adapter-factory.ts                     (unchanged)
├── adapters/
│   └── telegram.adapter.ts               (unchanged)
├── handlers/
│   ├── draft.handler.interface.ts         IDraftHandler
│   ├── draft.handler.ts                   DraftHandler implements IDraftHandler
│   ├── import.handler.interface.ts        IImportHandler
│   ├── import.handler.ts                  ImportHandler implements IImportHandler
│   ├── callback.handler.interface.ts      ICallbackHandler
│   └── callback.handler.ts               CallbackHandler implements ICallbackHandler
├── renderer/
│   └── draft.renderer.ts                  DraftRenderer
└── recipe-bot.ts                          RecipeBot (orchestrator)
```

**Deleted files** (logic migrates into classes):
- `draft-text-handler.ts`
- `draft-photo-handler.ts`
- `draft-callbacks.ts`
- `draft-renderer.ts` (top-level; replaced by `renderer/draft.renderer.ts`)

---

## Interfaces

### `IDraftHandler`

Handles user input (text and photo) when an active draft exists.

```ts
export interface IDraftHandler {
  handleText(draft: RecipeDraftEntity, text: string, setStatus?: SetStatus): Promise<string>
  handlePhoto(draft: RecipeDraftEntity, buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string>
}
```

### `IImportHandler`

Handles user input (text and photo) when **no active draft** exists — falls through to the import pipeline.

```ts
export interface IImportHandler {
  handleText(text: string, setStatus?: SetStatus): Promise<string>
  handlePhoto(buffer: Buffer, mimeType: string, caption?: string, setStatus?: SetStatus): Promise<string>
}
```

### `ICallbackHandler`

Handles all inline keyboard callbacks (both global and draft-scoped).

```ts
export interface ICallbackHandler {
  handle(data: string, context: { chatId: string; userId: string }): Promise<BotResponse>
}
```

---

## Classes

### `DraftRenderer`

Stateless class. No external dependencies. Registered in DI as singleton.

Methods:
- `renderDraft(draft): BotResponse`
- `renderDraftText(draft): string`
- `renderDraftMenuButtons(draftId): BotButton[][]`
- `renderUnknownCallback(): BotResponse`

### `DraftHandler`

Implements `IDraftHandler`. Owns all logic for processing user messages in the context of an active draft.

Dependencies (injected):
- `IRecipeDraftService`
- `IRecipeAssistantService`
- `DraftRenderer`

Responsibilities:
- Routes by `draft.pendingAction`: `waiting_for_step`, `waiting_for_ingredient`, `waiting_for_video`, `waiting_for_photo`, `null`
- Calls `normalizeSteps` / `normalizeIngredient` / `classifyText` / `classifyPhoto` on the assistant
- Uses `withTicker()` helper (private static) for long-running AI calls with live status updates
- Falls back to `importService` for photo if `classifyPhoto` times out — **Note:** for this fallback, `DraftHandler.handlePhoto` receives `IImportHandler` via injection (not `IImportJobService` directly), keeping the import logic owned by `ImportHandler`

### `ImportHandler`

Implements `IImportHandler`. Owns the "no draft" import pipeline.

Dependencies (injected):
- `IImportJobService`

Responsibilities:
- Detects URLs via regex, routes to `importFromUrl` vs `importFromText`
- Routes photo to `importFromPhoto` or `importFromTextWithPhoto`

### `CallbackHandler`

Implements `ICallbackHandler`. Handles all inline keyboard callbacks.

Dependencies (injected):
- `IRecipeDraftService`
- `IRecipeAssistantService`
- `DraftRenderer`

Responsibilities:
- `new_recipe` → creates draft
- `continue_draft` → loads draft or shows "no draft" message
- `draft:*:id` → switches on action: `add_ingredient`, `add_step`, `add_photo`, `add_video`, `ask_ai`, `suggest_missing`, `save`, `confirm_save`, `back`

### `RecipeBot`

Thin orchestrator. Registers handlers on the adapter. Routes incoming messages to appropriate domain handlers.

Dependencies (injected):
- `IBotAdapter`
- `IRecipeDraftService` — only for routing: checks if active draft exists
- `IDraftHandler`
- `IImportHandler`
- `ICallbackHandler`

`RecipeBot` contains **no business logic** — only routing and adapter wiring.

---

## Dependency Graph

```
RecipeBot
  ├── IBotAdapter
  ├── IRecipeDraftService        (routing only)
  ├── IDraftHandler (DraftHandler)
  │     ├── IRecipeDraftService
  │     ├── IRecipeAssistantService
  │     ├── IImportHandler       (for photo fallback)
  │     └── DraftRenderer
  ├── IImportHandler (ImportHandler)
  │     └── IImportJobService
  └── ICallbackHandler (CallbackHandler)
        ├── IRecipeDraftService
        ├── IRecipeAssistantService
        └── DraftRenderer
```

> **Note on circular dependency:** `DraftHandler` → `IImportHandler` → `ImportHandler` (no back-reference). InversifyJS resolves this safely since `ImportHandler` does not depend on `DraftHandler`.

---

## DI Tokens (`bot.tokens.ts`)

```ts
export const RecipeBotToken         = Symbol('RecipeBot')
export const DraftHandlerToken      = Symbol('DraftHandler')
export const ImportHandlerToken     = Symbol('ImportHandler')
export const CallbackHandlerToken   = Symbol('CallbackHandler')
export const DraftRendererToken     = Symbol('DraftRenderer')
```

All five are registered in `container.ts` as singletons.

---

## Testing

Each class is independently testable with mocked interfaces:

| Class | Mock dependencies |
|---|---|
| `DraftRenderer` | none |
| `ImportHandler` | `IImportJobService` |
| `CallbackHandler` | `IRecipeDraftService`, `IRecipeAssistantService`, `DraftRenderer` |
| `DraftHandler` | `IRecipeDraftService`, `IRecipeAssistantService`, `IImportHandler`, `DraftRenderer` |
| `RecipeBot` | `IBotAdapter`, `IRecipeDraftService`, `IDraftHandler`, `IImportHandler`, `ICallbackHandler` |

Existing `recipe-bot.test.ts` continues to cover `RecipeBot` routing. New test files added for each handler class.

---

## Migration Path

1. Create `bot.tokens.ts`
2. Create `renderer/draft.renderer.ts` as `@injectable()` class
3. Create handler interfaces
4. Implement `ImportHandler`
5. Implement `CallbackHandler`
6. Implement `DraftHandler` (depends on `IImportHandler` — implement after step 4)
7. Rewrite `RecipeBot` to use `@inject` tokens
8. Register all in `container.ts`
9. Delete old function files
10. Update/add tests
