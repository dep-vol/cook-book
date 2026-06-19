# Multi-bot provider design

## Goal

Remove hardcoded `'telegram'` strings throughout the bot module and support running multiple bot providers simultaneously in a single process.

## Context

Currently `adapter-factory.ts` reads `BOT_PROVIDER` and returns a single `IBotAdapter`. The string `'telegram'` is hardcoded in five places across `RecipeBot`, `CallbackHandler`, and `DraftHandler`. There is no mechanism to run more than one adapter at a time.

## Changes

### 1. `bot-adapter.interface.ts`

Add `channel: string` to `BotCallbackContext` and `readonly channel: string` to `IBotAdapter`:

```ts
export interface BotCallbackContext {
  channel: string
  chatId: string
  userId: string
}

export interface IBotAdapter {
  readonly channel: string
  onStart(handler: () => BotResponse): void
  onText(...): void
  onPhoto(...): void
  onCallback(...): void
  start(): void
}
```

### 2. `adapters/telegram.adapter.ts`

Implement `readonly channel = 'telegram'`. Include `channel: this.channel` when building context objects inside `onText`, `onPhoto`, and `onCallback`.

### 3. `adapter-factory.ts`

Replace `createBotAdapter()` with `createBotAdapters(): IBotAdapter[]`. Reads `BOT_PROVIDERS` (comma-separated). `BOT_PROVIDER` (singular) is removed.

```ts
export function createBotAdapters(): IBotAdapter[] {
  const providers = (process.env.BOT_PROVIDERS ?? 'telegram').split(',')
  return providers.map(p => createAdapter(p.trim()))
}
```

Adding a new provider = one new `case` in `createAdapter` + one new class in `adapters/`.

### 4. `recipe-bot.ts`

Replace two hardcoded `'telegram'` with `context.channel`:

```ts
const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)
```

### 5. `handlers/callback.handler.ts`

Replace three hardcoded `'telegram'` with `context.channel`. Interface `ICallbackHandler` is unchanged — it already accepts `BotCallbackContext`.

### 6. `handlers/draft.handler.ts` line 229

Replace hardcoded `'telegram'` with `draft.channel` (already present on the entity):

```ts
const updated = await this.draftService.getActiveDraft(draft.channel, draft.channelChatId, draft.channelUserId)
```

### 7. `scripts/bot.ts`

Iterate over all adapters, create one `RecipeBot` per adapter, start all:

```ts
const adapters = createBotAdapters()
for (const adapter of adapters) {
  new RecipeBot(adapter, container.get(...), ...).register().start()
}
```

## Why multiple bots work without further changes

- `RecipeBot` is stateless relative to the adapter — each instance is independent.
- DI-injected handlers (`CallbackHandler`, `DraftHandler`, `ImportHandler`) are stateless — safe to share across multiple `RecipeBot` instances.
- `context.channel` is set by each adapter independently, so drafts are namespaced by channel and never cross.

## Env variable

| Variable | Value | Notes |
|---|---|---|
| `BOT_PROVIDERS` | `telegram` | Default; comma-separated for multiple |
| `BOT_PROVIDERS` | `telegram,discord` | Runs both in one process |

`BOT_PROVIDER` (singular) is removed.

## Files changed

| File | Change |
|---|---|
| `src/modules/bot/bot-adapter.interface.ts` | Add `channel` to interface and context |
| `src/modules/bot/adapters/telegram.adapter.ts` | Implement `channel`, include in context |
| `src/modules/bot/adapter-factory.ts` | Return `IBotAdapter[]`, read `BOT_PROVIDERS` |
| `src/modules/bot/recipe-bot.ts` | Use `context.channel` |
| `src/modules/bot/handlers/callback.handler.ts` | Use `context.channel` |
| `src/modules/bot/handlers/draft.handler.ts` | Use `draft.channel` |
| `scripts/bot.ts` | Iterate adapters, create one `RecipeBot` each |
