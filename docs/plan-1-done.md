# Plan 1: Foundation + Web CRUD — Выполнено

Дата: 2026-05-25  
Ветка: `feat/plan-1-foundation`

---

## Что реализовано

Полное Next.js-приложение для управления рецептами с слоистой архитектурой, Inversify DI, MobX-формами и Docker-инфраструктурой.

---

## Стек

| Категория | Технология | Версия |
|---|---|---|
| Фреймворк | Next.js (App Router) | 16.2.6 |
| Язык | TypeScript | 5.x |
| ORM | Drizzle ORM | 0.45.x |
| База данных | PostgreSQL | 16-alpine (Docker) |
| Хранилище файлов | MinIO (S3-compatible) | latest (Docker) |
| Dependency Injection | Inversify | 8.1.x |
| Реактивность (клиент) | MobX + mobx-react-lite | 6.x / 4.x |
| Валидация | Zod | 4.x |
| Тесты | Vitest | 2.1.x |
| Стили | Tailwind CSS | 4.x |
| Пакетный менеджер | pnpm | 10.x |

---

## Инфраструктура

### Docker Compose (`docker-compose.yml`)

Два сервиса:

**PostgreSQL 16**
- Порт: `5433` на хосте → `5432` внутри контейнера
- Причина нестандартного порта: на хосте уже запущен локальный PostgreSQL на 5432
- Данные хранятся в Docker volume `postgres_data`
- Healthcheck: `pg_isready`

**MinIO**
- API: порт `9000`
- Web-консоль: порт `9001`
- Доступ: `minioadmin` / `minioadmin`
- Данные хранятся в Docker volume `minio_data`
- Healthcheck: HTTP GET `/minio/health/live`

### Переменные окружения (`.env`)

```
POSTGRES_USER=cookbook
POSTGRES_PASSWORD=cookbook_secret
POSTGRES_DB=cookbook
DATABASE_URL=postgresql://cookbook:cookbook_secret@localhost:5433/cookbook

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=recipes
MINIO_USE_SSL=false
```

### Запуск инфраструктуры

```bash
docker compose up -d
```

---

## База данных

### Схема (`src/lib/db/schema.ts`)

Две таблицы и два enum-типа:

**`recipes`**
| Колонка | Тип PostgreSQL | Описание |
|---|---|---|
| `id` | `uuid` | PK, генерируется автоматически |
| `title` | `text NOT NULL` | Название рецепта |
| `ingredients` | `jsonb NOT NULL` | Массив `{name, amount, unit}` |
| `steps` | `jsonb NOT NULL` | Массив `{order, text}` |
| `cook_time_minutes` | `integer` | Nullable |
| `servings` | `integer` | Nullable |
| `tags` | `text[]` | Массив тегов, default `[]` |
| `source_url` | `text` | Nullable |
| `image_key` | `text` | Ключ объекта в MinIO, nullable |
| `created_at` | `timestamptz` | Автоматически |
| `updated_at` | `timestamptz` | Обновляется вручную |

**`import_jobs`** — подготовлена для будущего Telegram-бота  
| Колонка | Тип | Описание |
|---|---|---|
| `id` | `uuid` | PK |
| `status` | `import_status` enum | `pending / processing / done / failed` |
| `source_type` | `source_type` enum | `photo / text / url` |
| `raw_input` | `text` | Сырой ввод от бота |
| `recipe_id` | `uuid` | FK → recipes, `ON DELETE SET NULL` |
| `error` | `text` | Сообщение об ошибке, если failed |
| `created_at` | `timestamptz` | — |

### Миграции

```bash
pnpm db:generate   # генерирует SQL в drizzle/migrations/
pnpm db:migrate    # применяет миграции (scripts/migrate.ts)
```

`drizzle-kit migrate` CLI не работает корректно в этом проекте — вместо него используется программный мигратор через `drizzle-orm/postgres-js/migrator`.

### Drizzle-клиент (`src/lib/db/index.ts`)

Singleton через `globalThis` — нужен потому что Next.js hot-reload в dev пересоздаёт модули, но не уничтожает `globalThis`. Без этого при каждом сохранении файла создавался бы новый пул соединений.

---

## Архитектура: слои

```
Browser / Telegram Bot
        │
        ▼
┌─────────────────────┐
│   View Layer        │  Server Components (async, только сервер)
│   (React)           │  Client Components (observer, гидрация)
└─────────┬───────────┘
          │ вызов Server Action
          ▼
┌─────────────────────┐
│   Transfer Layer    │  src/app/actions/recipe.actions.ts
│   (Server Actions)  │  'use server' + Zod-валидация на входе
└─────────┬───────────┘
          │ вызов через Inversify container
          ▼
┌─────────────────────┐
│   Service Layer     │  src/modules/recipes/services/
│                     │  Бизнес-логика, не знает про HTTP и React
└─────────┬───────────┘
          │ вызов через интерфейс IRecipeRepository
          ▼
┌─────────────────────┐
│   Repository Layer  │  src/modules/recipes/repositories/
│                     │  Только Drizzle-запросы, маппинг Row → Entity
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Database          │  PostgreSQL via Drizzle ORM
└─────────────────────┘
```

### Принцип зависимостей

Каждый слой зависит только от интерфейса нижнего слоя, не от конкретной реализации. `RecipeService` знает только `IRecipeRepository` — не `RecipeRepository`. Это позволяет подменять реализацию в тестах без изменения кода сервиса.

---

## Доменный слой

### Entity (`src/modules/recipes/entities/recipe.entity.ts`)

Чистый TypeScript-интерфейс. Только то, что нужно бизнес-логике — никаких snake_case, никаких HTTP-деталей, никакой специфики ORM.

```typescript
interface RecipeEntity {
  id: string
  title: string
  ingredients: Ingredient[]   // { name, amount, unit }
  steps: Step[]               // { order, text }
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
  sourceUrl: string | null
  imageKey: string | null
  createdAt: Date
  updatedAt: Date
}
```

### DTO + Zod (`src/modules/recipes/transport/recipe.dto.ts`)

`CreateRecipeSchema` и `UpdateRecipeSchema` (partial от Create). Валидация происходит в Server Actions — DTO никогда не "просачивается" глубже TransferLayer. Repository работает только с DTO-типами на входе и возвращает Entity.

---

## Repository Layer

**Интерфейс** (`recipe.repository.interface.ts`):
```typescript
interface IRecipeRepository {
  findAll(): Promise<RecipeEntity[]>
  findById(id: string): Promise<RecipeEntity | null>
  create(data: CreateRecipeDTO): Promise<RecipeEntity>
  update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity | null>
  delete(id: string): Promise<void>
}
```

**Реализация** (`recipe.repository.ts`):
- Прямые Drizzle-запросы (`.select()`, `.insert()`, `.update()`, `.delete()`)
- Приватный метод `mapToEntity(row)` — единственное место маппинга `RecipeRow → RecipeEntity`
- `update` делает явный partial update: строит объект `updateData` только из определённых полей, добавляет `updatedAt = new Date()`

---

## Service Layer + Inversify DI

### RecipeService (`src/modules/recipes/services/recipe.service.ts`)

Декоратор `@injectable()` помечает класс для Inversify. `@inject(RecipeRepositoryToken)` в конструкторе — Inversify передаёт нужную реализацию автоматически.

```typescript
@injectable()
export class RecipeService implements IRecipeService {
  constructor(
    @inject(RecipeRepositoryToken) private readonly repo: IRecipeRepository
  ) {}
  // getAll, getById, create, update, delete
}
```

`getById` и `update` бросают `Error` если рецепт не найден — слой выше (Server Action или Server Component) обрабатывает это через `notFound()` или возврат `{ error }`.

### Токены (`src/tokens/recipe.tokens.ts`)

Inversify 8.x не имеет класса `Token` — используется `Symbol.for()` в качестве `ServiceIdentifier`. `Symbol.for()` гарантирует один и тот же символ при повторных вызовах (в отличие от `Symbol()`, который всегда создаёт новый).

```typescript
export const RecipeRepositoryToken: ServiceIdentifier<IRecipeRepository> = Symbol.for('RecipeRepository')
export const RecipeServiceToken: ServiceIdentifier<IRecipeService> = Symbol.for('RecipeService')
```

### Composition Root (`src/lib/container.ts`)

Единственное место, где конкретные реализации связываются с токенами. Простой модульный синглтон (не `globalThis`) — контейнер не держит внешних ресурсов, поэтому его пересоздание при hot reload безвредно.

```typescript
export const container = new Container()
container.bind(RecipeRepositoryToken).to(RecipeRepository).inSingletonScope()
container.bind(RecipeServiceToken).to(RecipeService).inSingletonScope()
```

### Настройка TypeScript для декораторов

В `tsconfig.json` добавлены:
```json
"experimentalDecorators": true,
"emitDecoratorMetadata": true
```

`reflect-metadata` импортируется в двух местах: `src/lib/container.ts` (для Inversify) и `src/app/layout.tsx` (гарантирует загрузку до первого использования контейнера в SSR).

---

## Transfer Layer (Server Actions)

**`src/app/actions/recipe.actions.ts`** — директива `'use server'` делает эти функции серверными. Они компилируются в отдельные серверные эндпоинты, вызываются прозрачно из клиентских компонентов как обычные async-функции.

Паттерн:
1. Принять raw input
2. Zod `safeParse` → вернуть `{ error }` если невалидно
3. `container.get(RecipeServiceToken)` → вызов сервиса
4. `revalidatePath(...)` — инвалидирует Next.js кэш для Server Components
5. Вернуть `{ data: recipe }`

`deleteRecipeAction` не возвращает ничего — клиент сам делает `router.push('/')` после успеха.

---

## MinIO клиент (`src/lib/minio.ts`)

AWS SDK v3 подключается к MinIO через `forcePathStyle: true` (без этого SDK формирует URL вида `<bucket>.localhost`, который не резолвится). Три функции:

- `uploadImage(buffer, mimeType)` → загружает, возвращает `key`
- `getImageUrl(key)` → presigned URL на 1 час (не требует публичного бакета)
- `deleteImage(key)` → удаляет объект

**Бакет нужно создать вручную** через веб-консоль `http://localhost:9001` (имя: `recipes`).

---

## UI слой

### Server Components (нет клиентского JS)

**`src/app/(recipes)/page.tsx`** — список рецептов. Async-функция, `await service.getAll()` напрямую без useEffect. `(recipes)` — route group, не добавляет сегмент к URL: `/` рендерит этот компонент.

**`src/app/(recipes)/[id]/page.tsx`** — детальная страница. `params` в Next.js 16 — это `Promise<{id}>`, нужен `await params`. При ошибке сервиса вызывает `notFound()` → стандартная 404 страница Next.js.

**`src/modules/recipes/ui/recipe-card.tsx`** — карточка рецепта с названием, временем, порциями, тегами.

**`src/modules/recipes/ui/recipe-grid.tsx`** — сетка карточек 1/2/3 колонки (responsive). Показывает пустое состояние если рецептов нет.

> Дефолтный `src/app/page.tsx` от `create-next-app` удалён — он конфликтовал с `(recipes)/page.tsx`, т.к. route group не добавляет путь.

### Client Components (с гидрацией)

**`src/modules/recipes/ui/recipe-form.tsx`** — форма создания/редактирования. Обёрнута в `observer()` из `mobx-react-lite` — перерендеривается только при изменении VM, не родитель. VM создаётся один раз через `useState(() => new RecipeFormViewModel(...))`.

**`src/app/recipes/new/page.tsx`** — страница создания рецепта. Передаёт `createRecipeAction` как `onSubmit` в форму. После успешного создания делает `router.push` на страницу нового рецепта.

**`src/app/(recipes)/[id]/edit/page.tsx`** — страница редактирования. Загружает рецепт через `getRecipeByIdAction` в `useEffect`, заполняет форму через `initialData`. Кнопка "Удалить" вызывает `deleteRecipeAction` после `confirm()`, после чего редирект на главную.

### MobX ViewModel (`src/modules/recipes/view-models/recipe-form.vm.ts`)

Класс с `makeAutoObservable`. Управляет состоянием формы: динамические списки ингредиентов и шагов, поля, флаги `isSubmitting`/`error`. Не знает про React, не знает про Server Actions — получает `onSubmit: (data) => Promise<void>` через конструктор. Это аналог `@foxford/vm` паттерна.

Метод `submit()`:
1. Устанавливает `isSubmitting = true`
2. Собирает DTO из полей
3. Вызывает `onSubmit`
4. В `finally` через `runInAction` сбрасывает `isSubmitting`
5. В `catch` через `runInAction` устанавливает `error`

> `runInAction` нужен в async-контексте (в `catch`/`finally`) потому что MobX strict mode требует, чтобы изменения observable происходили внутри action-обёртки.

---

## Тесты

```
tests/
├── setup.ts                          # import 'reflect-metadata'
└── unit/recipes/
    ├── recipe.dto.test.ts            # 3 теста: валидация CreateRecipeSchema
    └── recipe.service.test.ts        # 4 теста: RecipeService с mock-репозиторием
```

```bash
pnpm test:run
# Test Files  2 passed (2)
# Tests  7 passed (7)
```

**Ключевой паттерн тестирования RecipeService:** создаётся напрямую через `new RecipeService(mockRepo)`, минуя Inversify. Это возможно именно потому что Service зависит от интерфейса, а не от конкретного класса — декораторы Inversify не мешают ручному созданию.

### Конфигурация Vitest (`vitest.config.ts`)

```typescript
resolve: { alias: { '@': path.resolve(__dirname, './src') } }
```

Алиас задаётся напрямую — без `vite-tsconfig-paths`. Причина: `vite-tsconfig-paths` v5 — ESM-only, несовместим с Vitest 2.x CJS; v4 требует Vite, но Vite 8.x тоже ESM-only.

---

## Структура файлов

```
cook-book/
├── docker-compose.yml
├── .env / .env.example
├── drizzle/migrations/              # SQL-файлы миграций
├── scripts/
│   └── migrate.ts                   # Программный мигратор
├── src/
│   ├── app/
│   │   ├── layout.tsx               # Root layout + навигация
│   │   ├── globals.css
│   │   ├── (recipes)/               # Route group (путь = /)
│   │   │   ├── layout.tsx           # Контейнер с max-width
│   │   │   ├── page.tsx             # Список рецептов (Server Component)
│   │   │   └── [id]/
│   │   │       ├── page.tsx         # Детальная страница (Server Component)
│   │   │       └── edit/
│   │   │           └── page.tsx     # Редактирование (Client Component)
│   │   ├── recipes/
│   │   │   └── new/
│   │   │       └── page.tsx         # Создание рецепта (Client Component)
│   │   └── actions/
│   │       └── recipe.actions.ts    # Server Actions (TransferLayer)
│   ├── modules/recipes/
│   │   ├── entities/
│   │   │   └── recipe.entity.ts
│   │   ├── transport/
│   │   │   └── recipe.dto.ts
│   │   ├── repositories/
│   │   │   ├── recipe.repository.interface.ts
│   │   │   └── recipe.repository.ts
│   │   ├── services/
│   │   │   ├── recipe.service.interface.ts
│   │   │   └── recipe.service.ts
│   │   ├── view-models/
│   │   │   └── recipe-form.vm.ts
│   │   └── ui/
│   │       ├── recipe-card.tsx
│   │       ├── recipe-grid.tsx
│   │       └── recipe-form.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts             # Drizzle singleton
│   │   │   └── schema.ts
│   │   ├── container.ts             # Inversify Composition Root
│   │   └── minio.ts                 # S3-клиент
│   └── tokens/
│       └── recipe.tokens.ts         # Symbol.for() идентификаторы
└── tests/
    ├── setup.ts
    └── unit/recipes/
        ├── recipe.dto.test.ts
        └── recipe.service.test.ts
```

---

## Важные решения и подводные камни

| Проблема | Решение |
|---|---|
| Локальный PostgreSQL занимает порт 5432 | Docker маппинг `5433:5432` |
| `drizzle-kit migrate` CLI падает без ошибки | Программный мигратор в `scripts/migrate.ts` |
| Inversify 8.x не имеет класса `Token` | `Symbol.for()` как `ServiceIdentifier<T>` |
| `vite-tsconfig-paths` несовместим с Vitest 2.x | Прямой алиас в `vitest.config.ts` |
| Hot reload Next.js пересоздаёт DB-пул | Singleton через `globalThis._pgClient` |
| `src/app/page.tsx` конфликтует с `(recipes)/page.tsx` | Удалён дефолтный `page.tsx` |
| MobX `runInAction` в async контексте | Обязателен в `catch`/`finally` async-метода VM |

---

## Команды

```bash
# Инфраструктура
docker compose up -d              # запустить postgres + minio
docker compose down               # остановить
docker compose ps                 # статус

# База данных
pnpm db:generate                  # сгенерировать миграцию после изменения схемы
pnpm db:migrate                   # применить миграции
pnpm db:studio                    # веб-UI для просмотра БД (порт 4983)

# Разработка
pnpm dev                          # Next.js dev server (порт 3000)
pnpm build                        # production сборка
pnpm test:run                     # все тесты однократно
pnpm test                         # тесты в watch-режиме
```

---

## Следующий шаг

**Plan 2: Telegram Bot**
- grammY (long polling, не нужен публичный IP)
- DeepSeek API — парсинг фото и текста в рецепт
- Обработчики: фото → OCR + парсинг, текст → парсинг, URL → скрапинг + парсинг
- `import_jobs` таблица уже готова в схеме
