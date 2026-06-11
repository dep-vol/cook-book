# Recipe Bot Interactivity — Design Spec

## Goal

Сделать создание рецепта в Telegram-боте более живым и управляемым:
- inline-кнопки вместо "свободного чата без рамок"
- черновик рецепта с сохранением прогресса
- помощь ИИ в заполнении и правке черновика
- фото как обложка рецепта
- видео как ссылка, прикреплённая к рецепту

## Non-goals

- Не строим полноценный визуальный редактор в веб-админке
- Не распознаём содержимое видео
- Не добавляем сложную галерею медиа на несколько файлов в v1
- Не заменяем текущий `ImportJob`-флоу; он остаётся для одноразового импорта из текста, фото и URL

## Current State

Сейчас бот умеет:
- принимать текст
- принимать фото
- принимать URL
- отправлять всё это в `ImportJobService`

Но:
- нет состояния диалога
- нет inline-кнопок
- нет черновика, который можно редактировать по шагам
- нет отдельного сценария "создать рецепт вместе с ИИ"

## Architecture

```
Telegram user
  → TelegramAdapter
  → RecipeBot
  → RecipeDraftService
  → RecipeAssistantService (LLM)
  → RecipeService
  → RecipeRepository / DB
```

### Responsibilities

- `TelegramAdapter`  
  Обрабатывает `message:text`, `message:photo`, `callback_query` и отправляет ответы с inline-keyboard.

- `RecipeBot`  
  Оркестрирует сценарий: старт, создание черновика, уточнения, подтверждение, сохранение.

- `RecipeDraftService`  
  Хранит и обновляет черновик, состояние шага и прикреплённые медиа.

- `RecipeAssistantService`  
  Использует LLM только для точечных задач: предложить черновик, заполнить пропуски, нормализовать ингредиенты и шаги, подготовить итог к сохранению.

- `RecipeService`  
  Создаёт финальный рецепт из подтверждённого черновика.

## Interaction Model

### Entry points

В `/start` бот показывает:
- `Новый рецепт`
- `Продолжить черновик`
- `Импорт из текста`
- `Импорт из фото`
- `Импорт по ссылке`

### Draft flow

1. Пользователь выбирает `Новый рецепт`
2. Бот предлагает источник:
   - `Ввести текст`
   - `Отправить фото`
   - `Дать ссылку на рецепт`
   - `С нуля`
3. Бот создаёт черновик и переводит его в `editing`
4. В `editing` бот показывает текущую карточку черновика и кнопки:
   - `Добавить ингредиент`
   - `Добавить шаг`
   - `Прикрепить фото`
   - `Добавить видео-ссылку`
   - `Спросить ИИ`
   - `Сохранить`
5. Перед сохранением бот показывает итог и просит подтверждение:
   - `Сохранить`
   - `Править`
   - `Отменить`

### Media behavior

- Фото, отправленное в сценарии черновика, становится обложкой рецепта
- Видео принимается только как ссылка и сохраняется в рецепте как `videoUrl`
- ИИ не анализирует видео и не пытается извлечь из него шаги

## Data Model

### New draft entity

Добавляется отдельная сущность `RecipeDraft`.

Минимальные поля:
- `id`
- `telegramChatId`
- `telegramUserId`
- `state`
- `title`
- `ingredients`
- `steps`
- `cookTimeMinutes`
- `servings`
- `tags`
- `sourceText`
- `sourceUrl` — ссылка на исходный рецепт, если пользователь прислал URL источника
- `coverImageKey`
- `videoUrl` — отдельная ссылка на видео-подсказку / видео-рецепт
- `lastAiSuggestion`
- `createdAt`
- `updatedAt`
- `expiresAt`

Хранение можно сделать в одной таблице с JSON-полем для рабочего состояния, чтобы не раздувать схему раньше времени.

### Recipe changes

Финальный `Recipe` получает:
- `imageKey` уже существует и остаётся обложкой
- `videoUrl: string | null` добавляется как отдельное поле; в v1 это именно ссылка, не встроенный плеер

Это требует обновить:
- DTO
- schema / repository mapping
- detail page display

## AI Behavior

ИИ используется как помощник, а не как автономный автор.

Разрешённые действия:
- собрать стартовый черновик из текста или фото
- предложить недостающие ингредиенты или шаги
- сделать краткую/подробную версию
- нормализовать формулировки
- вернуть структурированный результат для подтверждения

Запрещённые действия:
- не менять рецепт молча
- не сохранять без явного подтверждения
- не придумывать видео-контент по ссылке

## Error Handling

| Ситуация | Поведение |
|---|---|
| Черновик не найден | Бот предлагает начать заново |
| Callback устарел | Бот сообщает, что сессия обновилась, и показывает актуальный черновик |
| LLM вернул невалидный JSON | Черновик остаётся на месте, бот предлагает повторить или править вручную |
| Фото не удалось загрузить в MinIO | Бот сообщает об ошибке и не теряет остальные данные |
| Ссылка на видео невалидна | Бот просит отправить корректный URL |
| Пользователь шлёт неожиданный тип сообщения | Бот объясняет, что сейчас ждёт: текст, фото или ссылку |

## File Impact

### Bot layer

- `src/modules/bot/bot-adapter.interface.ts`
- `src/modules/bot/adapters/telegram.adapter.ts`
- `src/modules/bot/recipe-bot.ts`
- `src/modules/bot/adapter-factory.ts`

### Draft layer

- new `src/modules/recipe-drafts/` module
- repository / service / entity for draft state

### Recipe layer

- `src/modules/recipes/entities/recipe.entity.ts`
- `src/modules/recipes/transport/recipe.dto.ts`
- `src/modules/recipes/db/recipe.schema.ts`
- `src/modules/recipes/repositories/recipe.repository.ts`
- `src/modules/recipes/ui/recipe-card.tsx`
- `src/app/recipes/[id]/page.tsx`

### AI / import layer

- `src/modules/import-jobs/services/recipe-parser.service.ts`
- new assistant service for draft-specific LLM prompts

## Tests

- `RecipeBot` routes text / photo / callback actions to the right branch
- draft state transitions: `start → editing → confirming → saved`
- photo attachment stores `coverImageKey`
- video URL attachment stores `videoUrl`
- LLM response validation rejects malformed output without losing draft data
- final save creates a recipe and revalidates the UI

## Scope Boundary for v1

В первой версии достаточно:
- inline-кнопок
- черновика рецепта
- одной обложки
- одной video-ссылки
- подтверждения перед сохранением

Расширение в сторону нескольких медиа, вложенных шагов и сложного визуального редактора лучше отложить отдельно.
