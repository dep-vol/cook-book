# cook-book — Design Spec

**Дата:** 2026-05-25  
**Лицензия:** GPL v3  
**GitHub:** dep-vol/cook-book

## Цель проекта

Персональное приложение для хранения рецептов с двумя точками входа: Telegram-бот (фото, текст, URL) и веб-интерфейс. Главная цель — прокачать навыки современного full-stack Next.js и DevOps через реальный проект.

## Принцип реализации

**Строго поэтапная имплементация.** Каждый этап — самостоятельная работающая единица, которую можно запустить и понять перед переходом к следующему. Не переходить к следующему шагу, пока текущий не работает и не понят.

- Каждый этап заканчивается рабочим, проверяемым результатом
- Новые концепции вводятся по одной — не смешивать несколько незнакомых технологий в одном шаге
- Перед стартом каждого этапа — краткое объяснение, что и почему делаем
- После завершения этапа — проверка через `docker compose up` или прямой тест

---

## Стек технологий

| Слой | Технология |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| State management | MobX + mobx-react-lite |
| DI | Inversify |
| ORM | Drizzle ORM |
| База данных | PostgreSQL 16 |
| Хранилище фото | MinIO (S3-совместимое, локальное) |
| Telegram бот | grammY (long polling) |
| AI парсинг | DeepSeek API (deepseek-chat) |
| Веб-скрапинг | Cheerio (основной) + Playwright (fallback для JS-сайтов) |
| Инфраструктура | Docker Compose |

---

## Архитектура системы

### Сервисы (Docker Compose)

```
┌─────────────────────────────────────────────────┐
│                Docker Compose                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ next-app │  │  tg-bot  │  │   postgres    │  │
│  │  :3000   │  │ (polling)│  │    :5432      │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  ┌──────────────────────────┐                    │
│  │         minio            │                    │
│  │  :9000 (API) :9001 (UI)  │                    │
│  └──────────────────────────┘                    │
└─────────────────────────────────────────────────┘
```

Все сервисы в одной Docker-сети. `tg-bot` и `next-app` — оба Node.js процессы из одного репозитория. Бот импортирует `RecipeService` напрямую через общий модульный слой (`src/modules/recipes/services/`), а не через HTTP к `next-app`.

### Потоки данных

**Поток 1 — Фото через Telegram:**
```
Пользователь → Telegram → tg-bot (grammY)
→ скачать файл → загрузить в MinIO (temp/)
→ DeepSeek Vision (deepseek-chat)
→ Zod-валидация ответа
→ RecipeService → PostgreSQL
→ бот отвечает с подтверждением
```

**Поток 2 — Текст через Telegram:**
```
Пользователь → Telegram → tg-bot
→ DeepSeek (deepseek-chat) структурирует в JSON
→ Zod-валидация
→ RecipeService → PostgreSQL
```

**Поток 3 — URL (Telegram или Web):**
```
URL → Cheerio scraping
  └→ (fallback) Playwright для JS-сайтов
→ извлечённый текст → DeepSeek
→ Zod-валидация
→ RecipeService → PostgreSQL
```

**Поток 4 — Веб-интерфейс:**
```
Next.js Client Component
→ Server Action ('use server')
→ RecipeRepository → Drizzle → PostgreSQL
→ revalidatePath → обновление Server Component
```

---

## Модель данных

### Таблица `recipes`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | Primary key |
| `title` | text | Название рецепта |
| `ingredients` | jsonb | `[{ name, amount, unit }]` |
| `steps` | jsonb | `[{ order, text }]` |
| `cook_time_minutes` | integer | Время готовки |
| `servings` | integer | Количество порций |
| `tags` | text[] | Массив тегов/категорий |
| `source_url` | text | Источник (URL сайта или null) |
| `image_key` | text | Ключ файла в MinIO |
| `created_at` | timestamptz | — |
| `updated_at` | timestamptz | — |

### Таблица `import_jobs`

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | Primary key |
| `status` | enum | `pending / processing / done / failed` |
| `source_type` | enum | `photo / text / url` |
| `raw_input` | text | Исходный текст или URL |
| `recipe_id` | uuid | FK → recipes (после успешного парсинга) |
| `error` | text | Сообщение об ошибке |
| `created_at` | timestamptz | — |

---

## Frontend-архитектура

Адаптация слоистой архитектуры из корпоративного стандарта (`@foxford/vm` → MobX, `@foxford/ioc` → Inversify).

### Слои

```
View (React) → ViewModel (MobX) → Service → Repository → TransferLayer → DB
```

| Слой | Реализация | Правило |
|---|---|---|
| **View** | Server Component / Client Component + `observer()` | Нет бизнес-логики, только рендер |
| **ViewModel** | MobX class + `makeAutoObservable` | Нет HTTP, нет DTO, только через Service |
| **Service** | Чистые TypeScript классы | Бизнес-правила, DI через конструктор |
| **Repository** | Маппинг DTO → Entity | Единая точка доступа к данным |
| **TransferLayer** | Server Actions (`'use server'`) + Zod | Валидация на входе, DTO не покидает слой |
| **DI** | Inversify Container | Composition Root в `lib/container.ts` |

### Server vs Client Components

**Server Component** (страницы с чистым чтением):
- Нет ViewModel — данные напрямую через Repository → Drizzle
- Нет клиентского JS, быстрый рендер
- Используется для: список рецептов, детальная страница

**Client Component** (интерактив):
- `observer()` = аналог `.use()` из `@foxford/vm`
- MobX ViewModel управляет состоянием экрана
- Используется для: форма редактирования, поиск/фильтрация, форма импорта URL

### Структура файлов

```
src/
├── app/                          # Next.js App Router
│   ├── (recipes)/
│   │   ├── page.tsx             # Server Component — список
│   │   ├── @modal/              # Parallel Route — модальное окно
│   │   └── [id]/
│   │       ├── page.tsx         # Server Component — детали
│   │       └── edit/page.tsx    # Client Component — редактирование
│   ├── import/
│   │   └── page.tsx             # Client Component — импорт по URL
│   └── actions/                 # Server Actions (TransferLayer)
│       └── recipe.actions.ts
├── modules/
│   └── recipes/
│       ├── entities/            # RecipeEntity (доменный объект)
│       ├── transport/           # Zod DTO-схемы
│       ├── repositories/        # RecipeRepository
│       ├── services/            # RecipeService
│       ├── view-models/         # RecipeListViewModel, RecipeFormViewModel
│       └── ui/                  # React-компоненты
├── lib/
│   ├── db/                      # Drizzle schema + client
│   ├── minio.ts                 # MinIO client
│   └── container.ts             # Inversify Composition Root
├── tokens/                      # Inversify токены
└── bot/                         # Telegram bot (отдельный entrypoint)
    ├── handlers/
    │   ├── photo.handler.ts
    │   ├── text.handler.ts
    │   └── url.handler.ts
    └── index.ts
```

---

## Веб-интерфейс (страницы)

| Маршрут | Тип | Описание |
|---|---|---|
| `/` | Server Component | Сетка рецептов с фильтрацией по тегам |
| `/recipes/[id]` | Server Component | Детальная страница рецепта |
| `/recipes/[id]/edit` | Client Component | Форма редактирования (MobX ViewModel) |
| `/recipes/new` | Client Component | Ручное создание рецепта |
| `/import` | Client Component | Ввод URL + статус парсинга |

### Next.js 15 фичи для прокачки

- **Server Components** — прямой доступ к БД без API-слоя
- **Server Actions** — мутации с `revalidatePath`, без ручного REST
- **Parallel Routes** (`@modal`) — модальное окно деталей поверх сетки
- **Optimistic Updates** (`useOptimistic`) — мгновенный UI при добавлении/удалении
- **`next/image`** — оптимизация фото из MinIO
- **`unstable_cache`** — кэширование запросов к БД с тегами инвалидации

---

## Telegram Bot (grammY)

- **Transport:** Long polling — не требует публичного IP, идеально для локального сервера
- **Плагины:** `conversations` (многошаговые диалоги), `session` (состояние пользователя)
- **Conversation flow:** после парсинга бот предлагает уточнить теги через `conversations` плагин
- **DeepSeek промпт:** структурированный JSON-вывод через `response_format: { type: "json_object" }`. Для фото — модель с поддержкой vision (уточнить актуальное название на docs.deepseek.com при старте, сейчас кандидат `deepseek-chat` с image_url в сообщении)
- **Fallback:** если DeepSeek вернул невалидный JSON — бот сообщает об ошибке и предлагает попробовать ещё раз

---

## Инфраструктура

### Docker Compose

```yaml
# docker-compose.yml (production)
services:
  app:      # next build, порт 3000
  bot:      # ts-node bot/index.ts
  postgres: # postgres:16-alpine, named volume
  minio:    # minio/minio, порты 9000/9001
```

```yaml
# docker-compose.dev.yml (разработка)
# volume mount для hot reload
# NEXT_PUBLIC_DEV=true
```

### Переменные окружения (`.env`)

```
TELEGRAM_BOT_TOKEN=
DEEPSEEK_API_KEY=
DATABASE_URL=postgresql://...
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=recipes
```

### Миграции

```bash
docker compose run app npm run db:migrate
```

### Доступ в локальной сети

- Приложение: `http://[IP]:3000`
- MinIO консоль: `http://[IP]:9001`

---

## Что прокачаешь

| Направление | Конкретные навыки |
|---|---|
| **Next.js 15** | Server Components, Server Actions, Parallel Routes, Optimistic Updates, кэширование |
| **Архитектура** | Слоистая архитектура, DI с Inversify, MobX ViewModel pattern |
| **DevOps** | Docker Compose, multi-stage builds, переменные окружения, локальный деплой |
| **AI интеграция** | DeepSeek API, промпт-инжиниринг для структурированного вывода, Zod-валидация ответов |
| **Telegram** | grammY, long polling, conversations plugin, обработка медиафайлов |
| **БД** | Drizzle ORM, PostgreSQL, миграции, jsonb-поля |
