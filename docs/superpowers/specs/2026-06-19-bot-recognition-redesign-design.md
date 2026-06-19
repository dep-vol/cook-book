# Дизайн: переработка логики бота — фокус на распознавании рецептов

**Дата:** 2026-06-19
**Статус:** утверждён к планированию

## Цель

Переориентировать Telegram-бота с интерактивной ручной сборки рецепта на
**машину распознавания**: много вариантов ввода, максимальное качество
извлечения. Любое распознавание **обязательно** создаёт черновик. Доработка
черновика в боте — **только через ИИ** (диалогом). Ручное редактирование полей
в боте отсутствует; ручная правка возможна только для **опубликованных
рецептов в админке** (как сейчас).

## Решения (зафиксированы в брейншторме)

- **Источники ввода:** текст, фото, URL сайтов, видео (Reels/YouTube/TikTok).
- **Глубина видео:** простой путь — описание/подпись + субтитры (если доступны).
  Без скачивания аудио, yt-dlp и анализа кадров.
- **Провайдер LLM:** OpenRouter (OpenAI-совместимый, один ключ на всё). Ложится
  в существующую абстракцию `LLMService` (настраиваемый `baseURL`).
  Для видео именно `gemini 2.5 flash lite` не подходит (видео не умеет, линейка
  2.0/2.5-lite устаревает) — но видео нам и не скармливается напрямую: видео
  сводится к тексту (описание + субтитры), поэтому достаточно текстовой модели.
- **Активный черновик + новый источник:** спросить пользователя
  (дополнить текущий / начать новый).
- **Публикация:** бот может публиковать черновик в рецепт (кнопка в чате).
- **Ручная правка:** только опубликованные рецепты, только в админке.
- **Архитектура:** единый `RecognitionService` с адаптерами-источниками +
  единый `RecipeExtractor`; единый `DraftRefinementService` для ИИ-доработки.

## Архитектура

### Новый модуль `src/modules/recognition/`

```
src/modules/recognition/
├── recognition.service.ts            # оркестратор
├── recognition.service.interface.ts
├── sources/
│   ├── source.interface.ts           # IRecognitionSource
│   ├── text.source.ts                # passthrough
│   ├── photo.source.ts               # vision-вход
│   ├── url.source.ts                 # Cheerio + Puppeteer скрапинг
│   └── video.source.ts               # описание + субтитры
├── extractor/
│   ├── recipe-extractor.ts           # единый LLM-вызов: NormalizedContent → ParsedRecipe
│   └── recipe-extractor.interface.ts
└── recognition.tokens.ts
```

**`NormalizedContent`** — общий промежуточный вид, к которому источник сводит вход:

```ts
interface NormalizedContent {
  text?: string
  images?: Array<{ base64: string; mimeType: string }>
  sourceUrl?: string
  coverImageUrl?: string   // og:image и т.п. — кандидат на обложку
}
```

**`IRecognitionSource`**

```ts
interface IRecognitionSource {
  /** подходит ли источник для данного входа */
  detect(input: RecognitionInput): boolean
  /** свести вход к нормализованному контенту */
  extract(input: RecognitionInput): Promise<NormalizedContent>
}
```

`RecognitionInput` = `{ kind: 'text'; text } | { kind: 'photo'; buffer; mimeType; caption? } | { kind: 'url'; url }`.

**`RecipeExtractor`** — единственная точка LLM-извлечения. Принимает
`NormalizedContent` (текст и/или изображения), формирует один промпт (через
OpenRouter), возвращает `ParsedRecipe`, валидируется Zod-схемой
(переиспользуем/перенесём `ParsedRecipeSchema`). Поддерживает частичный
результат: незаполненные поля = `null` / `[]`.

**`RecognitionService.recognize(input)`** — поток:

```
recognize(input):
  source = sources.find(s => s.detect(input))     // см. порядок detect ниже
  content = await source.extract(input)
  parsed  = await extractor.extract(content)
  coverImageKey = content.coverImageUrl|images
                  ? await uploadImage(...) : null
  draft = await draftService.createDraft({
            ...parsed, sourceType, sourceUrl, coverImageKey })
  job-log: import-jobs запись (sourceType, status, draftId, error)
  return draft
```

**Порядок detect (важен):** URL вида youtube/youtu.be/instagram/tiktok →
`VideoSource`; прочий `http(s)` URL → `UrlSource`; вход с фото → `PhotoSource`;
иначе → `TextSource`.

**VideoSource (простой путь):**
- Скрапим страницу через существующий Puppeteer/Cheerio.
- Берём `og:title` + `og:description` / мета-описание / видимое описание.
- Для YouTube — пробуем публичные субтитры (timedtext endpoint); при неудаче
  остаёмся на описании.
- Обложка — `og:image`.
- Всё сводим в `NormalizedContent.text` (+ `coverImageUrl`).

**Поглощение `url-scraper`:** Cheerio + Puppeteer-логика переезжает в
`url.source` / `video.source`. Модуль `src/modules/url-scraper/` удаляется,
токен `UrlScraperToken` — тоже (или переиспользуется внутри recognition).

### Изменения в данных

**`recipe-draft.entity.ts`:**
- `sourceType`: `'manual' | 'text' | 'photo' | 'url' | 'video'` (добавить `video`).
- **Удалить** `pendingAction` и тип `DraftPendingAction`.
- `state` оставить (`editing | confirming | saved | expired`) — нужен для
  публикации с подтверждением.
- Сохраняем: `sourceText`, `sourceUrl`, `coverImageKey`, `videoUrl`,
  `lastAiSuggestion`.
- **Добавить** транзитное поле `pendingSource: NormalizedContent | null` —
  буфер входящего источника на время развилки «дополнить/новый» (см. поток
  бота). Это **не** возврат ручных режимов: поле хранит распознанный контент, а
  не режим ввода полей. Сбрасывается в `null` после выбора пользователя.

**`import_jobs`:** добавить ссылку на `draftId` (рядом с `recipeId`); `recipeId`
заполняется только при публикации. Миграция Drizzle.

**`LLMService` / env:** добавить переменные под OpenRouter
(`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, имена моделей для извлечения,
vision и доработки). Текущая baseURL-абстракция остаётся; добавляем явные
геттеры под новые роли при необходимости.

### ИИ-доработка: `DraftRefinementService`

```
src/modules/recipe-drafts/services/draft-refinement.service.ts
src/modules/recipe-drafts/services/draft-refinement.service.interface.ts
```

`refine(draft, message)`, где `message = { text?: string; image?: { base64; mimeType } }`.

LLM получает текущий черновик целиком (JSON) + сообщение + системную инструкцию
«верни патч». Возвращает (Zod-валидируемый) `RefinementResult`:

```ts
interface RefinementResult {
  operations: Array<
    | { op: 'set_field'; field: 'title' | 'cookTimeMinutes' | 'servings'; value: string | number | null }
    | { op: 'set_tags'; tags: string[] }
    | { op: 'add_ingredients'; items: Ingredient[] }
    | { op: 'remove_ingredient'; index: number }
    | { op: 'replace_ingredients'; items: Ingredient[] }
    | { op: 'add_steps'; items: Step[] }
    | { op: 'remove_step'; order: number }
    | { op: 'replace_steps'; items: Step[] }
  >
  answer?: string   // если это вопрос, а не правка
  summary: string   // человекочитаемое «что сделал»
}
```

Сервис применяет операции (нормализует порядок шагов), сохраняет черновик.
Рендерер показывает обновлённый черновик + `summary`.

**Удаляется:** `recipe-assistant.service` и его интерфейс целиком
(`classifyText`, `normalizeSteps`, `normalizeIngredient`, `suggestMissingFields`,
`classifyPhoto`, `suggestFromText`, `suggestFromPhoto`).

## Поток бота

```
onStart → приветствие + краткая справка (без «собрать вручную»).

onText / onPhoto:
  draft = getActiveDraft(...)
  если НЕТ активного черновика:
    draft = recognize(input)
    показать черновик + кнопки [Опубликовать] [Удалить]
  если ЕСТЬ активный черновик:
    если вход — новый источник распознавания (фото / URL / видео-URL):
      content = source.extract(input)
      draftService.updateDraft(draft.id, { pendingSource: content })
      спросить кнопками:
        [Дополнить текущий] → extractor.extract(pendingSource) → refine(draft, …)
                              → очистить pendingSource
        [Новый рецепт]      → discard(draft)
                              → recognize из pendingSource → новый черновик
    иначе (обычный текст-правка, нет нового источника):
      refine(draft, { text }) → показать черновик + summary
```

**Развилка «дополнить/новый» (явно):** при появлении нового источника
распознавания при активном черновике бот **не** применяет его сразу. Он
извлекает `NormalizedContent`, кладёт его в `pendingSource` черновика и
спрашивает кнопками. Выбор пользователя определяет, мержить ли контент в текущий
черновик (через `refine`) или начать новый (`discard` + новое распознавание).
После выбора `pendingSource` сбрасывается в `null`. Ограничение: это **не**
возврат ручных pendingAction-режимов и не кнопочное редактирование полей.

### Публикация

```
кнопки черновика: [✅ Опубликовать] [🗑 Удалить черновик]
Опубликовать → confirm → draftService.saveDraft(id) → recipe
  → ответ: ссылка на /recipes/:id и /admin/recipes/:id (для ручной правки)
```

Контур `setConfirming` / `confirm_save` сохраняем, лишние действия чистим.

## Что удаляется / упрощается

- `callback.handler`: действия `add_ingredient`, `add_step`, `add_photo`,
  `add_video`, `ask_ai`, `suggest_missing` и связанные тексты/кнопки.
- `draft.handler`: `handleStep`, `handleIngredient`, `handleVideoUrl`,
  `buildMissingSuggestion`, вся `pendingAction`-маршрутизация. Остаётся тонкая
  прослойка над `recognize` / `refine`.
- `recipe-assistant.service` (+ интерфейс) — целиком.
- `import-jobs`: прямое создание рецепта (`recipeService.create`) убирается —
  рецепт появляется только через публикацию черновика. Сервис остаётся тонким
  журналом попыток распознавания.
- `url-scraper` модуль — поглощается `recognition`.

## Тестирование (Vitest)

- Юнит на каждый `*.source`: `detect` + `extract` (видео/url с замоканным
  fetch/Puppeteer).
- `RecipeExtractor` с замоканным LLM: валидный / частичный / мусорный ответ.
- `DraftRefinementService`: применение операций к черновику (чистая логика
  apply, без LLM).
- `RecognitionService`: выбор источника по входу (порядок detect).
- Хэндлеры бота: ветка «есть/нет активного черновика», merge-vs-new.

## Вне области (YAGNI / отложено)

- Аудио-транскрипция видео (yt-dlp + Whisper) и анализ кадров.
- Нативный Gemini API с прямой YouTube-ссылкой и File API.
- Ручное редактирование черновиков в админке.
- Агентный LLM-цикл с инструментами.
