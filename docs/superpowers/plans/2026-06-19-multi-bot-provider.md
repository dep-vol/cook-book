# Multi-bot provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove hardcoded `'telegram'` channel strings from the bot module and support running multiple bot providers simultaneously via `BOT_PROVIDERS` env var.

**Architecture:** Add `channel: string` to `IBotAdapter` and `BotCallbackContext`; each adapter self-identifies its channel and includes it in every context object it builds; all hardcoded `'telegram'` strings are replaced by `context.channel` or `draft.channel`; `adapter-factory.ts` returns an array of adapters; `scripts/bot.ts` creates one `RecipeBot` per adapter and starts all.

**Tech Stack:** TypeScript, Inversify (DI), Vitest, grammy (Telegram)

## Global Constraints

- Run tests with: `pnpm test:run`
- TypeScript compilation is checked by tests — a type error = test failure
- No changes to business logic; only channel propagation changes
- `BOT_PROVIDERS` replaces `BOT_PROVIDER`; default is `'telegram'`

---

### Task 1: Update `bot-adapter.interface.ts` and `TelegramAdapter`

These are the foundational type changes. All downstream changes in tasks 2–5 depend on these types being correct first.

**Files:**
- Modify: `src/modules/bot/bot-adapter.interface.ts`
- Modify: `src/modules/bot/adapters/telegram.adapter.ts`

**Interfaces:**
- Produces: `BotCallbackContext` with `channel: string`, `IBotAdapter` with `readonly channel: string`; `TelegramAdapter` with `readonly channel = 'telegram'` and `channel` in all context objects

- [ ] **Step 1: Update `bot-adapter.interface.ts`**

Replace the entire file with:

```ts
export interface BotButton {
  text: string
  data: string
}

export interface BotResponse {
  text: string
  buttons?: BotButton[][]
}

export interface BotCallbackContext {
  channel: string
  chatId: string
  userId: string
}

/** Редактирует текущее статусное сообщение (spinner) не создавая новых */
export type SetStatus = (text: string) => Promise<void>

export interface IBotAdapter {
  readonly channel: string
  onStart(handler: () => BotResponse): void
  onText(handler: (text: string, context?: BotCallbackContext, setStatus?: SetStatus) => Promise<string>): void
  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string, context?: BotCallbackContext, setStatus?: SetStatus) => Promise<string>): void
  onCallback(handler: (data: string, context: BotCallbackContext) => Promise<BotResponse>): void
  start(): void
}
```

- [ ] **Step 2: Update `TelegramAdapter`**

Add `readonly channel = 'telegram'` and include `channel: this.channel` in all context objects:

```ts
import { Bot } from 'grammy'
import type { BotResponse, IBotAdapter, SetStatus } from '../bot-adapter.interface'

export class TelegramAdapter implements IBotAdapter {
  readonly channel = 'telegram'
  private readonly bot: Bot
  private readonly token: string

  constructor() {
    const token = process.env.BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set in .env')
    this.token = token
    this.bot = new Bot(token)
    this.bot.catch(err => console.error('Unhandled bot error:', err))
  }

  onStart(handler: () => BotResponse): void {
    this.bot.command('start', ctx => {
      const response = handler()
      return ctx.reply(response.text, this.toReplyOptions(response))
    })
  }

  onText(handler: (text: string, context?: { channel: string; chatId: string; userId: string }, setStatus?: SetStatus) => Promise<string>): void {
    this.bot.on('message:text', async ctx => {
      const statusMsg = await ctx.reply('⏳ Обрабатываю...')
      const chatId = String(ctx.chat.id)
      const userId = String(ctx.from?.id ?? ctx.chat.id)

      const setStatus: SetStatus = async (text) => {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, text).catch(() => {/* ignore edit race */})
      }

      try {
        const result = await handler(ctx.message.text, { channel: this.channel, chatId, userId }, setStatus)
        await ctx.api.editMessageText(chatId, statusMsg.message_id, result)
      } catch (err) {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, '❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onText handler:', err)
      }
    })
  }

  onPhoto(handler: (buffer: Buffer, mimeType: string, caption?: string, context?: { channel: string; chatId: string; userId: string }, setStatus?: SetStatus) => Promise<string>): void {
    this.bot.on('message:photo', async ctx => {
      const statusMsg = await ctx.reply('⏳ Скачиваю фото...')
      const chatId = String(ctx.chat.id)
      const userId = String(ctx.from?.id ?? ctx.chat.id)

      const setStatus: SetStatus = async (text) => {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, text).catch(() => {/* ignore edit race */})
      }

      try {
        await setStatus('⏳ Скачиваю фото...')
        const photo = ctx.message.photo.at(-1)!
        const file = await ctx.api.getFile(photo.file_id)
        const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`

        await setStatus('⏳ Загружаю фото...')
        const response = await fetch(fileUrl)
        if (!response.ok) throw new Error(`Failed to download photo: ${response.status}`)
        const buffer = Buffer.from(await response.arrayBuffer())
        const caption = ctx.message.caption?.trim() || undefined

        await setStatus('🤖 Анализирую фото...')
        const result = await handler(buffer, 'image/jpeg', caption, { channel: this.channel, chatId, userId }, setStatus)
        await ctx.api.editMessageText(chatId, statusMsg.message_id, result)
      } catch (err) {
        await ctx.api.editMessageText(chatId, statusMsg.message_id, '❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onPhoto handler:', err)
      }
    })
  }

  onCallback(handler: (data: string, context: { channel: string; chatId: string; userId: string }) => Promise<BotResponse>): void {
    this.bot.on('callback_query:data', async ctx => {
      try {
        await ctx.answerCallbackQuery()
        const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id
        if (!chatId) {
          await ctx.reply('❌ Не удалось определить чат. Попробуй ещё раз.')
          return
        }

        const response = await handler(ctx.callbackQuery.data, {
          channel: this.channel,
          chatId: String(chatId),
          userId: String(ctx.from.id),
        })
        await ctx.reply(response.text, this.toReplyOptions(response))
      } catch (err) {
        await ctx.reply('❌ Внутренняя ошибка. Попробуй ещё раз.')
        console.error('Error in onCallback handler:', err)
      }
    })
  }

  start(): void {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
    this.bot.start({ onStart: () => console.log(`Bot started (long polling). Web: ${webUrl}`) })
  }

  private toReplyOptions(response: BotResponse) {
    if (!response.buttons?.length) return undefined

    return {
      reply_markup: {
        inline_keyboard: response.buttons.map(row =>
          row.map(button => ({ text: button.text, callback_data: button.data }))
        ),
      },
    }
  }
}
```

- [ ] **Step 3: Run tests — expect TypeScript errors on mock objects missing `channel`**

```bash
pnpm test:run
```

Expected: failures in `recipe-bot.test.ts` and `callback.handler.test.ts` because mock objects don't have `channel` yet.

- [ ] **Step 4: Commit**

```bash
git add src/modules/bot/bot-adapter.interface.ts src/modules/bot/adapters/telegram.adapter.ts
git commit -m "feat(bot): add channel to IBotAdapter and BotCallbackContext, implement in TelegramAdapter"
```

---

### Task 2: Update `RecipeBot` and its tests

**Files:**
- Modify: `src/modules/bot/recipe-bot.ts`
- Modify: `tests/unit/bot/recipe-bot.test.ts`

**Interfaces:**
- Consumes: `BotCallbackContext` with `channel: string`, `IBotAdapter` with `readonly channel: string`

- [ ] **Step 1: Update tests — add `channel` to mock adapter and all context objects**

In `tests/unit/bot/recipe-bot.test.ts`:

Replace line 36:
```ts
let capturedTextHandler: ((text: string, context?: { chatId: string; userId: string }) => Promise<string>) | null = null
let capturedPhotoHandler: ((buf: Buffer, mime: string, caption?: string, context?: { chatId: string; userId: string }) => Promise<string>) | null = null
let capturedCallbackHandler: ((data: string, context: { chatId: string; userId: string }) => Promise<BotResponse>) | null = null
```
with:
```ts
let capturedTextHandler: ((text: string, context?: { channel: string; chatId: string; userId: string }) => Promise<string>) | null = null
let capturedPhotoHandler: ((buf: Buffer, mime: string, caption?: string, context?: { channel: string; chatId: string; userId: string }) => Promise<string>) | null = null
let capturedCallbackHandler: ((data: string, context: { channel: string; chatId: string; userId: string }) => Promise<BotResponse>) | null = null
```

Add `channel: 'telegram'` to the `mockAdapter` object (after line 41):
```ts
const mockAdapter: IBotAdapter = {
  channel: 'telegram',
  onStart: vi.fn(),
  onText: vi.fn((h) => { capturedTextHandler = h }),
  onPhoto: vi.fn((h) => { capturedPhotoHandler = h }),
  onCallback: vi.fn((h) => { capturedCallbackHandler = h }),
  start: vi.fn(),
}
```

Replace all context objects in test calls from `{ chatId: 'chat-1', userId: 'user-1' }` to `{ channel: 'telegram', chatId: 'chat-1', userId: 'user-1' }` — there are 5 occurrences on lines 87, 95, 102, 109, 116.

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm test:run tests/unit/bot/recipe-bot.test.ts
```

Expected: FAIL — `getActiveDraft` is still called with hardcoded `'telegram'`.

- [ ] **Step 3: Update `recipe-bot.ts` — replace `'telegram'` with `context.channel`**

Replace lines 41 and 49 in `src/modules/bot/recipe-bot.ts`:

```ts
// line 41 — inside onText
const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)

// line 49 — inside onPhoto
const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm test:run tests/unit/bot/recipe-bot.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/bot/recipe-bot.ts tests/unit/bot/recipe-bot.test.ts
git commit -m "feat(bot): use context.channel in RecipeBot instead of hardcoded 'telegram'"
```

---

### Task 3: Update `CallbackHandler` and its tests

**Files:**
- Modify: `src/modules/bot/handlers/callback.handler.ts`
- Modify: `tests/unit/bot/handlers/callback.handler.test.ts`

**Interfaces:**
- Consumes: `BotCallbackContext` with `channel: string`

- [ ] **Step 1: Update `ctx` fixture in callback handler test**

In `tests/unit/bot/handlers/callback.handler.test.ts`, replace line 9:
```ts
const ctx = { chatId: 'chat-1', userId: 'user-1' }
```
with:
```ts
const ctx = { channel: 'telegram', chatId: 'chat-1', userId: 'user-1' }
```

- [ ] **Step 2: Run tests — expect TypeScript pass, assert `channel: 'telegram'` still holds**

```bash
pnpm test:run tests/unit/bot/handlers/callback.handler.test.ts
```

Expected: FAIL — `createDraft` is still called with hardcoded `'telegram'`, and `getActiveDraft` is still called with hardcoded `'telegram'`.

- [ ] **Step 3: Update `callback.handler.ts` — replace `'telegram'` with `context.channel`**

Three substitutions in `src/modules/bot/handlers/callback.handler.ts`:

Line 23 — in `new_recipe` branch:
```ts
const draft = await this.draftService.createDraft({
  channel: context.channel,
  channelChatId: context.chatId,
  channelUserId: context.userId,
  sourceType: 'manual',
})
```

Line 32 — in `continue_draft` branch:
```ts
const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)
```

Line 82 — in `ask_ai` case:
```ts
const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)
```

Line 96 — in `suggest_missing` case:
```ts
const draft = await this.draftService.getActiveDraft(context.channel, context.chatId, context.userId)
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm test:run tests/unit/bot/handlers/callback.handler.test.ts
```

Expected: all tests PASS. The `createDraft` assertion checks `channel: 'telegram'` which equals `ctx.channel`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/bot/handlers/callback.handler.ts tests/unit/bot/handlers/callback.handler.test.ts
git commit -m "feat(bot): use context.channel in CallbackHandler instead of hardcoded 'telegram'"
```

---

### Task 4: Update `DraftHandler` and its tests

**Files:**
- Modify: `src/modules/bot/handlers/draft.handler.ts`
- Modify: `tests/unit/bot/handlers/draft.handler.test.ts`

**Interfaces:**
- Consumes: `RecipeDraftEntity` with `channel: string` (already present on entity)

- [ ] **Step 1: Run existing tests to confirm they pass before the change**

```bash
pnpm test:run tests/unit/bot/handlers/draft.handler.test.ts
```

Expected: PASS (test fixture has `channel: 'telegram'` on `baseDraft`; hardcoded `'telegram'` matches).

- [ ] **Step 2: Update `draft.handler.ts` line 229**

In `src/modules/bot/handlers/draft.handler.ts`, line 229:
```ts
// было:
const updated = await this.draftService.getActiveDraft('telegram', draft.channelChatId, draft.channelUserId)
// стало:
const updated = await this.draftService.getActiveDraft(draft.channel, draft.channelChatId, draft.channelUserId)
```

- [ ] **Step 3: Run tests — expect pass**

```bash
pnpm test:run tests/unit/bot/handlers/draft.handler.test.ts
```

Expected: all tests PASS. The test fixture `baseDraft.channel = 'telegram'` so the result is identical.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test:run
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/bot/handlers/draft.handler.ts
git commit -m "feat(bot): use draft.channel in DraftHandler instead of hardcoded 'telegram'"
```

---

### Task 5: Multi-bot runner — `adapter-factory.ts` + `scripts/bot.ts`

**Files:**
- Modify: `src/modules/bot/adapter-factory.ts`
- Modify: `scripts/bot.ts`

**Interfaces:**
- Consumes: `IBotAdapter` with `readonly channel: string`
- Produces: `createBotAdapters(): IBotAdapter[]`; entry script starts N bots

- [ ] **Step 1: Update `adapter-factory.ts`**

Replace the entire file:

```ts
import type { IBotAdapter } from './bot-adapter.interface'
import { TelegramAdapter } from './adapters/telegram.adapter'

function createAdapter(provider: string): IBotAdapter {
  switch (provider) {
    case 'telegram': return new TelegramAdapter()
    default: throw new Error(`Unknown bot provider: "${provider}". Supported: telegram`)
  }
}

export function createBotAdapters(): IBotAdapter[] {
  const providers = (process.env.BOT_PROVIDERS ?? 'telegram').split(',').map(p => p.trim()).filter(Boolean)
  return providers.map(createAdapter)
}
```

- [ ] **Step 2: Update `scripts/bot.ts`**

Replace the entire file:

```ts
// scripts/bot.ts
import 'dotenv/config'
import 'reflect-metadata'
import { container } from '@/container'
import { RecipeDraftServiceToken } from '@/tokens/recipe-draft.tokens'
import { DraftHandlerToken, ImportHandlerToken, CallbackHandlerToken } from '@/modules/bot/bot.tokens'
import { createBotAdapters } from '@/modules/bot/adapter-factory'
import { RecipeBot } from '@/modules/bot/recipe-bot'

const adapters = createBotAdapters()
for (const adapter of adapters) {
  new RecipeBot(
    adapter,
    container.get(RecipeDraftServiceToken),
    container.get(DraftHandlerToken),
    container.get(ImportHandlerToken),
    container.get(CallbackHandlerToken),
  ).register().start()
}
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm test:run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/bot/adapter-factory.ts scripts/bot.ts
git commit -m "feat(bot): support multiple providers via BOT_PROVIDERS env, replace BOT_PROVIDER"
```
