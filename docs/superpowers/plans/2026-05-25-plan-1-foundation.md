# cook-book Plan 1: Foundation + Web CRUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочее Next.js 15 приложение с полным CRUD рецептов, слоистой архитектурой (Entity → Repository → Service → Server Action → Server/Client Component) и локальным Docker Compose окружением.

**Architecture:** Next.js 15 App Router с Server Components для чтения и Client Components + MobX ViewModel для форм. Сервисный слой полностью изолирован от React — чистые TypeScript классы, связанные через Inversify DI. Server Actions выступают TransferLayer (Zod-валидация на входе).

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, PostgreSQL 16, MinIO, MobX, Inversify, Zod, Tailwind CSS v4, shadcn/ui, Vitest, Docker Compose

---

## Принцип

Каждый Task — самостоятельная рабочая единица. Не переходи к следующему, пока текущий не понят и не работает. Тесты пишутся ДО кода (TDD) там, где это применимо (сервисный и репозиторный слои). Инфраструктурные шаги верифицируются через `docker compose up` и ручную проверку.

---

## Карта файлов

```
cook-book/
├── docker-compose.yml              # Production сервисы
├── docker-compose.dev.yml          # Dev override (hot reload)
├── .env.example                    # Шаблон переменных окружения
├── .gitignore
│
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout
│   │   │   (файл page.tsx от create-next-app нужно удалить — конфликт с (recipes)/page.tsx)
│   │   ├── (recipes)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # Server Component — список рецептов
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Server Component — детальная страница
│   │   │       └── edit/
│   │   │           └── page.tsx    # Client Component — форма редактирования
│   │   ├── recipes/
│   │   │   └── new/
│   │   │       └── page.tsx        # Client Component — новый рецепт
│   │   └── actions/
│   │       └── recipe.actions.ts   # Server Actions (TransferLayer)
│   │
│   ├── modules/
│   │   └── recipes/
│   │       ├── entities/
│   │       │   └── recipe.entity.ts          # RecipeEntity interface
│   │       ├── transport/
│   │       │   └── recipe.dto.ts             # Zod schemas + DTO types
│   │       ├── repositories/
│   │       │   ├── recipe.repository.interface.ts
│   │       │   └── recipe.repository.ts      # Drizzle implementation
│   │       ├── services/
│   │       │   ├── recipe.service.interface.ts
│   │       │   └── recipe.service.ts
│   │       ├── view-models/
│   │       │   └── recipe-form.vm.ts         # MobX ViewModel
│   │       └── ui/
│   │           ├── recipe-grid.tsx            # Server Component
│   │           ├── recipe-card.tsx            # Server Component
│   │           └── recipe-form.tsx            # Client Component (observer)
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts                       # Drizzle client
│   │   │   └── schema.ts                      # Drizzle schema
│   │   ├── minio.ts                           # MinIO client + helpers
│   │   └── container.ts                       # Inversify Composition Root
│   │
│   └── tokens/
│       └── recipe.tokens.ts                   # Inversify tokens
│
└── tests/
    ├── setup.ts                               # Vitest global setup
    └── unit/
        └── recipes/
            ├── recipe.service.test.ts
            └── recipe.repository.test.ts
```

---

## Task 1: Инициализация проекта и Docker Compose

**Что изучаешь:** структура Next.js 15 App Router проекта, docker-compose для dev/prod, переменные окружения.

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: Next.js проект (команда)

- [ ] **Step 1.1: Создай Next.js 15 проект**

```bash
cd /Users/aleksandrsolodovnikov/projects/cook-book
pnpm dlx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint
```

Когда спросит про `--turbopack` — выбери Yes.

- [ ] **Step 1.2: Установи базовые зависимости**

```bash
# Production
pnpm add drizzle-orm postgres zod mobx mobx-react-lite inversify reflect-metadata @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Dev
pnpm add -D drizzle-kit vitest @vitejs/plugin-react vite-tsconfig-paths @types/node
```

- [ ] **Step 1.3: Создай `docker-compose.yml`**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
  minio_data:
```

- [ ] **Step 1.4: Создай `docker-compose.dev.yml`**

```yaml
# docker-compose.dev.yml
# Запуск: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
services:
  postgres:
    ports:
      - "5432:5432"   # уже есть в base, явно повторяем для dev

  minio:
    ports:
      - "9000:9000"
      - "9001:9001"
```

- [ ] **Step 1.5: Создай `.env.example`**

```bash
# .env.example
POSTGRES_USER=cookbook
POSTGRES_PASSWORD=cookbook_secret
POSTGRES_DB=cookbook
DATABASE_URL=postgresql://cookbook:cookbook_secret@localhost:5432/cookbook

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=recipes
MINIO_USE_SSL=false
```

- [ ] **Step 1.6: Создай `.env` из шаблона**

```bash
cp .env.example .env
```

- [ ] **Step 1.7: Добавь в `.gitignore`**

Открой `.gitignore` и убедись, что есть строки:
```
.env
.env.local
.superpowers/
```

- [ ] **Step 1.8: Запусти инфраструктуру и проверь**

```bash
docker compose up -d postgres minio
docker compose ps
```

Ожидаемый вывод: оба сервиса в статусе `healthy` или `running`.

```bash
# Проверь, что postgres отвечает
docker compose exec postgres psql -U cookbook -c "\l"
```

Ожидаемый вывод: список баз данных, включая `cookbook`.

```bash
# Проверь MinIO — открой в браузере
open http://localhost:9001
# Логин: minioadmin / minioadmin
```

- [ ] **Step 1.9: Закоммить**

```bash
git add docker-compose.yml docker-compose.dev.yml .env.example .gitignore
git add src/ package.json pnpm-lock.yaml tsconfig.json next.config.ts tailwind.config.ts
git commit -m "feat: initialize Next.js 15 project with Docker Compose"
```

---

## Task 2: Drizzle ORM — схема и миграции

**Что изучаешь:** Drizzle ORM schema definition (type-safe альтернатива Prisma), миграции, pgEnum для статусов, jsonb-поля для динамических структур.

**Files:**
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 2.1: Создай `drizzle.config.ts`**

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

- [ ] **Step 2.2: Создай `src/lib/db/schema.ts`**

```typescript
// src/lib/db/schema.ts
import { pgTable, uuid, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'

export const importStatusEnum = pgEnum('import_status', ['pending', 'processing', 'done', 'failed'])
export const sourceTypeEnum = pgEnum('source_type', ['photo', 'text', 'url'])

export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  ingredients: jsonb('ingredients').notNull().$type<Array<{ name: string; amount: string; unit: string }>>(),
  steps: jsonb('steps').notNull().$type<Array<{ order: number; text: string }>>(),
  cookTimeMinutes: integer('cook_time_minutes'),
  servings: integer('servings'),
  tags: text('tags').array().notNull().default([]),
  sourceUrl: text('source_url'),
  imageKey: text('image_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: importStatusEnum('status').notNull().default('pending'),
  sourceType: sourceTypeEnum('source_type').notNull(),
  rawInput: text('raw_input').notNull(),
  recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type RecipeRow = typeof recipes.$inferSelect
export type NewRecipeRow = typeof recipes.$inferInsert
```

- [ ] **Step 2.3: Создай `src/lib/db/index.ts`**

```typescript
// src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

// В Next.js важно создавать один connection pool, а не новый на каждый запрос.
// В development hot-reload пересоздаёт модули — используем globalThis для singleton.
declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined
}

const client = globalThis._pgClient ?? postgres(connectionString)
if (process.env.NODE_ENV !== 'production') globalThis._pgClient = client

export const db = drizzle(client, { schema })
```

- [ ] **Step 2.4: Добавь скрипты в `package.json`**

Открой `package.json` и добавь в `"scripts"`:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio",
"db:push": "drizzle-kit push"
```

- [ ] **Step 2.5: Сгенерируй и примени миграцию**

```bash
# Генерация SQL миграции
pnpm db:generate
```

Ожидаемый вывод: файл в `drizzle/migrations/0000_*.sql`.

```bash
# Применение миграции (postgres должен быть запущен)
pnpm db:migrate
```

Ожидаемый вывод: `All migrations applied successfully.`

- [ ] **Step 2.6: Проверь таблицы в PostgreSQL**

```bash
docker compose exec postgres psql -U cookbook -c "\dt"
```

Ожидаемый вывод: список таблиц `import_jobs`, `recipes` и enum-типы.

- [ ] **Step 2.7: Закоммить**

```bash
git add src/lib/db/ drizzle/ drizzle.config.ts package.json pnpm-lock.yaml
git commit -m "feat: add Drizzle ORM schema and initial migration"
```

---

## Task 3: Domain Layer — Entity и DTO (Zod)

**Что изучаешь:** разница между Entity (доменный объект) и DTO (транспортный контракт). Entity — для бизнес-логики (camelCase, нативные типы). DTO — что приходит/уходит на границе системы (Zod-валидация).

**Files:**
- Create: `src/modules/recipes/entities/recipe.entity.ts`
- Create: `src/modules/recipes/transport/recipe.dto.ts`

- [ ] **Step 3.1: Создай `src/modules/recipes/entities/recipe.entity.ts`**

```typescript
// src/modules/recipes/entities/recipe.entity.ts

export interface Ingredient {
  name: string
  amount: string
  unit: string
}

export interface Step {
  order: number
  text: string
}

// RecipeEntity — доменный объект. Здесь живёт только то,
// что нужно бизнес-логике. Никаких HTTP-деталей, никаких snake_case.
export interface RecipeEntity {
  id: string
  title: string
  ingredients: Ingredient[]
  steps: Step[]
  cookTimeMinutes: number | null
  servings: number | null
  tags: string[]
  sourceUrl: string | null
  imageKey: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 3.2: Создай `src/modules/recipes/transport/recipe.dto.ts`**

```typescript
// src/modules/recipes/transport/recipe.dto.ts
import { z } from 'zod'

// DTO-схемы описывают контракт на входе/выходе (Server Actions, API).
// DTO не покидает TransferLayer — Repository маппит их в Entity.

export const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.string().min(1),
  unit: z.string(),
})

export const StepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string().min(1),
})

export const CreateRecipeSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  ingredients: z.array(IngredientSchema).min(1, 'Добавьте хотя бы один ингредиент'),
  steps: z.array(StepSchema).min(1, 'Добавьте хотя бы один шаг'),
  cookTimeMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  tags: z.array(z.string()).default([]),
  sourceUrl: z.string().url().nullable().optional(),
})

export const UpdateRecipeSchema = CreateRecipeSchema.partial()

export type CreateRecipeDTO = z.infer<typeof CreateRecipeSchema>
export type UpdateRecipeDTO = z.infer<typeof UpdateRecipeSchema>
```

- [ ] **Step 3.3: Настрой Vitest**

Создай `vitest.config.ts`:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
})
```

Создай `tests/setup.ts`:

```typescript
// tests/setup.ts
// Глобальный setup для всех тестов.
// reflect-metadata нужен Inversify для работы декораторов.
import 'reflect-metadata'
```

Добавь в `package.json` скрипт:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 3.4: Напиши тест для DTO-валидации**

Создай `tests/unit/recipes/recipe.dto.test.ts`:

```typescript
// tests/unit/recipes/recipe.dto.test.ts
import { describe, it, expect } from 'vitest'
import { CreateRecipeSchema } from '@/modules/recipes/transport/recipe.dto'

describe('CreateRecipeSchema', () => {
  it('validates a correct recipe', () => {
    const input = {
      title: 'Борщ',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать свёклу' }],
      cookTimeMinutes: 90,
      servings: 4,
      tags: ['суп', 'украинская кухня'],
      sourceUrl: null,
    }
    const result = CreateRecipeSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects a recipe with empty title', () => {
    const input = {
      title: '',
      ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
      steps: [{ order: 1, text: 'Нарезать' }],
      cookTimeMinutes: null,
      servings: null,
      tags: [],
    }
    const result = CreateRecipeSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title')
    }
  })

  it('rejects a recipe with no ingredients', () => {
    const input = {
      title: 'Борщ',
      ingredients: [],
      steps: [{ order: 1, text: 'Нарезать' }],
      cookTimeMinutes: null,
      servings: null,
      tags: [],
    }
    const result = CreateRecipeSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 3.5: Запусти тест — должен пройти**

```bash
pnpm test:run tests/unit/recipes/recipe.dto.test.ts
```

Ожидаемый вывод: `3 passed`.

- [ ] **Step 3.6: Закоммить**

```bash
git add src/modules/recipes/entities/ src/modules/recipes/transport/ tests/ vitest.config.ts package.json
git commit -m "feat: add RecipeEntity, Zod DTOs, and Vitest setup"
```

---

## Task 4: Repository Layer

**Что изучаешь:** паттерн Repository — единая точка доступа к данным. Маппинг между DB-строками (snake_case) и Entity (camelCase). Interface для тестируемости.

**Files:**
- Create: `src/modules/recipes/repositories/recipe.repository.interface.ts`
- Create: `src/modules/recipes/repositories/recipe.repository.ts`

- [ ] **Step 4.1: Создай интерфейс репозитория**

```typescript
// src/modules/recipes/repositories/recipe.repository.interface.ts
import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'

export interface IRecipeRepository {
  findAll(): Promise<RecipeEntity[]>
  findById(id: string): Promise<RecipeEntity | null>
  create(data: CreateRecipeDTO): Promise<RecipeEntity>
  update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity | null>
  delete(id: string): Promise<void>
}
```

- [ ] **Step 4.2: Создай реализацию репозитория**

```typescript
// src/modules/recipes/repositories/recipe.repository.ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { recipes, type RecipeRow } from '@/lib/db/schema'
import type { IRecipeRepository } from './recipe.repository.interface'
import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'

export class RecipeRepository implements IRecipeRepository {
  private mapToEntity(row: RecipeRow): RecipeEntity {
    return {
      id: row.id,
      title: row.title,
      ingredients: row.ingredients as RecipeEntity['ingredients'],
      steps: row.steps as RecipeEntity['steps'],
      cookTimeMinutes: row.cookTimeMinutes,
      servings: row.servings,
      tags: row.tags,
      sourceUrl: row.sourceUrl,
      imageKey: row.imageKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async findAll(): Promise<RecipeEntity[]> {
    const rows = await db.select().from(recipes).orderBy(recipes.createdAt)
    return rows.map(this.mapToEntity)
  }

  async findById(id: string): Promise<RecipeEntity | null> {
    const rows = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1)
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async create(data: CreateRecipeDTO): Promise<RecipeEntity> {
    const rows = await db
      .insert(recipes)
      .values({
        title: data.title,
        ingredients: data.ingredients,
        steps: data.steps,
        cookTimeMinutes: data.cookTimeMinutes ?? null,
        servings: data.servings ?? null,
        tags: data.tags,
        sourceUrl: data.sourceUrl ?? null,
      })
      .returning()
    return this.mapToEntity(rows[0])
  }

  async update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity | null> {
    const rows = await db
      .update(recipes)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning()
    return rows[0] ? this.mapToEntity(rows[0]) : null
  }

  async delete(id: string): Promise<void> {
    await db.delete(recipes).where(eq(recipes.id, id))
  }
}
```

- [ ] **Step 4.3: Закоммить**

```bash
git add src/modules/recipes/repositories/
git commit -m "feat: add RecipeRepository with Drizzle ORM"
```

---

## Task 5: Service Layer + Inversify DI

**Что изучаешь:** Service изолирует бизнес-логику от деталей хранения. Inversify — Dependency Injection через декораторы и токены. Composition Root — единственное место, где связываются конкретные реализации.

**Files:**
- Create: `src/modules/recipes/services/recipe.service.interface.ts`
- Create: `src/modules/recipes/services/recipe.service.ts`
- Create: `src/tokens/recipe.tokens.ts`
- Create: `src/lib/container.ts`
- Create: `tests/unit/recipes/recipe.service.test.ts`

- [ ] **Step 5.1: Включи декораторы в `tsconfig.json`**

Открой `tsconfig.json` и добавь в `"compilerOptions"`:
```json
"experimentalDecorators": true,
"emitDecoratorMetadata": true
```

- [ ] **Step 5.2: Импортируй `reflect-metadata` в корне приложения**

Открой `src/app/layout.tsx` и добавь в самое начало файла:
```typescript
import 'reflect-metadata'
```

- [ ] **Step 5.3: Создай интерфейс сервиса**

```typescript
// src/modules/recipes/services/recipe.service.interface.ts
import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'

export interface IRecipeService {
  getAll(): Promise<RecipeEntity[]>
  getById(id: string): Promise<RecipeEntity>
  create(data: CreateRecipeDTO): Promise<RecipeEntity>
  update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity>
  delete(id: string): Promise<void>
}
```

- [ ] **Step 5.4: Создай реализацию сервиса**

```typescript
// src/modules/recipes/services/recipe.service.ts
import { injectable, inject } from 'inversify'
import { RecipeRepositoryToken } from '@/tokens/recipe.tokens'
import type { IRecipeRepository } from '../repositories/recipe.repository.interface'
import type { IRecipeService } from './recipe.service.interface'
import type { RecipeEntity } from '../entities/recipe.entity'
import type { CreateRecipeDTO, UpdateRecipeDTO } from '../transport/recipe.dto'

@injectable()
export class RecipeService implements IRecipeService {
  constructor(
    @inject(RecipeRepositoryToken) private readonly repo: IRecipeRepository
  ) {}

  async getAll(): Promise<RecipeEntity[]> {
    return this.repo.findAll()
  }

  async getById(id: string): Promise<RecipeEntity> {
    const recipe = await this.repo.findById(id)
    if (!recipe) throw new Error(`Recipe not found: ${id}`)
    return recipe
  }

  async create(data: CreateRecipeDTO): Promise<RecipeEntity> {
    return this.repo.create(data)
  }

  async update(id: string, data: UpdateRecipeDTO): Promise<RecipeEntity> {
    const recipe = await this.repo.update(id, data)
    if (!recipe) throw new Error(`Recipe not found: ${id}`)
    return recipe
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id)
  }
}
```

- [ ] **Step 5.5: Создай Inversify токены**

```typescript
// src/tokens/recipe.tokens.ts
import { Token } from 'inversify'
import type { IRecipeRepository } from '@/modules/recipes/repositories/recipe.repository.interface'
import type { IRecipeService } from '@/modules/recipes/services/recipe.service.interface'

// Токен — типобезопасный идентификатор зависимости.
// Классы зависят только от токенов, не от конкретных реализаций.
export const RecipeRepositoryToken = new Token<IRecipeRepository>('RecipeRepository')
export const RecipeServiceToken = new Token<IRecipeService>('RecipeService')
```

- [ ] **Step 5.6: Создай Composition Root**

```typescript
// src/lib/container.ts
import 'reflect-metadata'
import { Container } from 'inversify'
import { RecipeRepositoryToken, RecipeServiceToken } from '@/tokens/recipe.tokens'
import { RecipeRepository } from '@/modules/recipes/repositories/recipe.repository'
import { RecipeService } from '@/modules/recipes/services/recipe.service'

// Composition Root — единственное место, где конкретные реализации
// связываются с токенами. Всё остальное зависит только от интерфейсов.

function buildContainer(): Container {
  const container = new Container()

  container
    .bind(RecipeRepositoryToken)
    .to(RecipeRepository)
    .inSingletonScope()

  container
    .bind(RecipeServiceToken)
    .to(RecipeService)
    .inSingletonScope()

  return container
}

// Singleton контейнер — один на весь процесс Next.js (аналогично db client)
declare global {
  // eslint-disable-next-line no-var
  var _container: Container | undefined
}

export const container = globalThis._container ?? buildContainer()
if (process.env.NODE_ENV !== 'production') globalThis._container = container
```

- [ ] **Step 5.7: Напиши тест для RecipeService (TDD)**

Создай `tests/unit/recipes/recipe.service.test.ts`:

```typescript
// tests/unit/recipes/recipe.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecipeService } from '@/modules/recipes/services/recipe.service'
import type { IRecipeRepository } from '@/modules/recipes/repositories/recipe.repository.interface'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'

const mockRecipe: RecipeEntity = {
  id: 'uuid-1',
  title: 'Борщ',
  ingredients: [{ name: 'Свёкла', amount: '300', unit: 'г' }],
  steps: [{ order: 1, text: 'Нарезать свёклу' }],
  cookTimeMinutes: 90,
  servings: 4,
  tags: ['суп'],
  sourceUrl: null,
  imageKey: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

const mockRepo: IRecipeRepository = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

describe('RecipeService', () => {
  let service: RecipeService

  beforeEach(() => {
    vi.clearAllMocks()
    // Создаём сервис с mock-репозиторием напрямую (не через Inversify)
    service = new RecipeService(mockRepo)
  })

  it('getAll returns all recipes', async () => {
    vi.mocked(mockRepo.findAll).mockResolvedValue([mockRecipe])
    const result = await service.getAll()
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Борщ')
  })

  it('getById returns recipe when found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(mockRecipe)
    const result = await service.getById('uuid-1')
    expect(result.id).toBe('uuid-1')
  })

  it('getById throws when recipe not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null)
    await expect(service.getById('missing-id')).rejects.toThrow('Recipe not found: missing-id')
  })

  it('delete calls repository', async () => {
    vi.mocked(mockRepo.delete).mockResolvedValue(undefined)
    await service.delete('uuid-1')
    expect(mockRepo.delete).toHaveBeenCalledWith('uuid-1')
  })
})
```

- [ ] **Step 5.8: Запусти тесты — должны пройти**

```bash
pnpm test:run tests/unit/recipes/recipe.service.test.ts
```

Ожидаемый вывод: `4 passed`.

- [ ] **Step 5.9: Закоммить**

```bash
git add src/modules/recipes/services/ src/tokens/ src/lib/container.ts tsconfig.json tests/unit/
git commit -m "feat: add RecipeService with Inversify DI and unit tests"
```

---

## Task 6: Server Actions (TransferLayer)

**Что изучаешь:** Server Actions в Next.js 15 — функции с директивой `'use server'`, которые выполняются на сервере но вызываются из клиента. Это наш TransferLayer: Zod-валидация на входе, вызов Service, `revalidatePath` для обновления Server Components.

**Files:**
- Create: `src/app/actions/recipe.actions.ts`

- [ ] **Step 6.1: Создай Server Actions**

```typescript
// src/app/actions/recipe.actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { container } from '@/lib/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { CreateRecipeSchema, UpdateRecipeSchema } from '@/modules/recipes/transport/recipe.dto'

// Server Actions — TransferLayer.
// Правила: Zod-валидация на входе, DTO не покидает этот файл (выше идут уже Entity).

export async function getRecipesAction() {
  const service = container.get(RecipeServiceToken)
  return service.getAll()
}

export async function getRecipeByIdAction(id: string) {
  const service = container.get(RecipeServiceToken)
  return service.getById(id)
}

export async function createRecipeAction(formData: unknown) {
  const parsed = CreateRecipeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const service = container.get(RecipeServiceToken)
  const recipe = await service.create(parsed.data)

  revalidatePath('/')
  revalidatePath('/recipes')
  return { data: recipe }
}

export async function updateRecipeAction(id: string, formData: unknown) {
  const parsed = UpdateRecipeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  const service = container.get(RecipeServiceToken)
  const recipe = await service.update(id, parsed.data)

  revalidatePath('/')
  revalidatePath(`/recipes/${id}`)
  return { data: recipe }
}

export async function deleteRecipeAction(id: string) {
  const service = container.get(RecipeServiceToken)
  await service.delete(id)

  revalidatePath('/')
  revalidatePath('/recipes')
}
```

- [ ] **Step 6.2: Закоммить**

```bash
git add src/app/actions/
git commit -m "feat: add Server Actions as TransferLayer with Zod validation"
```

---

## Task 7: MinIO клиент

**Что изучаешь:** S3-совместимое API, presigned URLs — временные ссылки для прямой загрузки файлов из браузера без проксирования через Next.js сервер.

**Files:**
- Create: `src/lib/minio.ts`

- [ ] **Step 7.1: Создай MinIO клиент**

```typescript
// src/lib/minio.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const s3 = new S3Client({
  endpoint: `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true, // обязательно для MinIO
})

const BUCKET = process.env.MINIO_BUCKET!

export async function uploadImage(buffer: Buffer, mimeType: string): Promise<string> {
  const key = `recipes/${randomUUID()}`
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }))
  return key
}

export async function getImageUrl(key: string): Promise<string> {
  // Presigned URL — работает 1 час, не требует публичного доступа к бакету
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(s3, command, { expiresIn: 3600 })
}

export async function deleteImage(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
```

- [ ] **Step 7.2: Создай MinIO бакет через веб-консоль**

1. Открой `http://localhost:9001` (login: minioadmin / minioadmin)
2. Перейди в **Buckets → Create Bucket**
3. Имя бакета: `recipes`
4. Нажми **Create Bucket**

- [ ] **Step 7.3: Закоммить**

```bash
git add src/lib/minio.ts
git commit -m "feat: add MinIO S3 client with presigned URL support"
```

---

## Task 8: Server Components — список и детальная страница

**Что изучаешь:** Server Components в Next.js 15 — async компоненты, которые рендерятся только на сервере. Прямой доступ к данным без useEffect и fetch. Нет гидрации = нет клиентского JS = быстро.

**Files:**
- Create: `src/app/(recipes)/page.tsx`
- Create: `src/app/(recipes)/layout.tsx`
- Create: `src/app/(recipes)/[id]/page.tsx`
- Create: `src/modules/recipes/ui/recipe-grid.tsx`
- Create: `src/modules/recipes/ui/recipe-card.tsx`

- [ ] **Step 8.1: Создай layout для recipes**

```typescript
// src/app/(recipes)/layout.tsx
export default function RecipesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {children}
    </div>
  )
}
```

- [ ] **Step 8.2: Создай RecipeCard**

```typescript
// src/modules/recipes/ui/recipe-card.tsx
import Link from 'next/link'
import type { RecipeEntity } from '../entities/recipe.entity'

interface RecipeCardProps {
  recipe: RecipeEntity
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link href={`/recipes/${recipe.id}`}>
      <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
        <h2 className="text-lg font-semibold truncate">{recipe.title}</h2>
        <div className="mt-2 text-sm text-gray-500 flex gap-3">
          {recipe.cookTimeMinutes && <span>⏱ {recipe.cookTimeMinutes} мин</span>}
          {recipe.servings && <span>🍽 {recipe.servings} порций</span>}
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {recipe.tags.map(tag => (
              <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 8.3: Создай RecipeGrid**

```typescript
// src/modules/recipes/ui/recipe-grid.tsx
import type { RecipeEntity } from '../entities/recipe.entity'
import { RecipeCard } from './recipe-card'

interface RecipeGridProps {
  recipes: RecipeEntity[]
}

export function RecipeGrid({ recipes }: RecipeGridProps) {
  if (recipes.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <p className="text-xl">Рецептов пока нет</p>
        <p className="mt-2">Добавь первый через Telegram-бота или кнопку ниже</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {recipes.map(recipe => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  )
}
```

- [ ] **Step 8.4: Создай страницу со списком рецептов**

```typescript
// src/app/(recipes)/page.tsx
import Link from 'next/link'
import { container } from '@/lib/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'
import { RecipeGrid } from '@/modules/recipes/ui/recipe-grid'

// Это async Server Component — он выполняется на сервере.
// Никакого useEffect, fetch или loading state — просто await.
export default async function RecipesPage() {
  const service = container.get(RecipeServiceToken)
  const recipes = await service.getAll()

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Мои рецепты</h1>
        <Link
          href="/recipes/new"
          className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          + Добавить рецепт
        </Link>
      </div>
      <RecipeGrid recipes={recipes} />
    </div>
  )
}
```

- [ ] **Step 8.5: Создай детальную страницу рецепта**

```typescript
// src/app/(recipes)/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { container } from '@/lib/container'
import { RecipeServiceToken } from '@/tokens/recipe.tokens'

interface RecipePageProps {
  params: Promise<{ id: string }>
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params
  const service = container.get(RecipeServiceToken)

  let recipe
  try {
    recipe = await service.getById(id)
  } catch {
    notFound()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
        <Link href={`/recipes/${id}/edit`} className="text-sm text-gray-500 hover:underline">
          Редактировать
        </Link>
      </div>

      <div className="flex gap-4 text-sm text-gray-500 mb-6">
        {recipe.cookTimeMinutes && <span>⏱ {recipe.cookTimeMinutes} мин</span>}
        {recipe.servings && <span>🍽 {recipe.servings} порций</span>}
      </div>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Ингредиенты</h2>
        <ul className="space-y-1">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-medium">{ing.amount} {ing.unit}</span>
              <span>{ing.name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Приготовление</h2>
        <ol className="space-y-3">
          {recipe.steps.map(step => (
            <li key={step.order} className="flex gap-3">
              <span className="font-bold text-gray-400 min-w-[1.5rem]">{step.order}.</span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {recipe.tags.map(tag => (
            <span key={tag} className="bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {recipe.sourceUrl && (
        <a href={recipe.sourceUrl} target="_blank" rel="noreferrer"
          className="mt-4 block text-sm text-blue-500 hover:underline">
          Источник →
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 8.6: Удали дефолтный `src/app/page.tsx`**

`create-next-app` создаёт `src/app/page.tsx`. Его нужно удалить — он конфликтует с `(recipes)/page.tsx`, который уже обрабатывает путь `/` (route group `(recipes)` не добавляет сегмент пути).

```bash
rm src/app/page.tsx
```

- [ ] **Step 8.7: Запусти Next.js и проверь**

```bash
pnpm dev
```

Открой `http://localhost:3000` — должна открыться страница со списком рецептов (пустая, с сообщением "Рецептов пока нет").

Открой `http://localhost:3000/recipes/nonexistent-id` — должна показаться 404 страница Next.js.

- [ ] **Step 8.8: Закоммить**

```bash
git add src/app/(recipes)/ src/app/page.tsx src/modules/recipes/ui/
git commit -m "feat: add Server Components for recipe list and detail pages"
```

---

## Task 9: MobX ViewModel + форма добавления рецепта

**Что изучаешь:** MobX ViewModel как аналог `@foxford/vm` — класс с `makeAutoObservable`, `observer()` HOC в React. Форма с динамическими списками (ингредиенты, шаги).

**Files:**
- Create: `src/modules/recipes/view-models/recipe-form.vm.ts`
- Create: `src/modules/recipes/ui/recipe-form.tsx`
- Create: `src/app/recipes/new/page.tsx`

- [ ] **Step 9.1: Создай RecipeFormViewModel**

```typescript
// src/modules/recipes/view-models/recipe-form.vm.ts
import { makeAutoObservable, runInAction } from 'mobx'
import type { CreateRecipeDTO } from '../transport/recipe.dto'
import type { Ingredient, Step } from '../entities/recipe.entity'

// ViewModel управляет состоянием экрана.
// Не знает про HTTP, не знает про Server Actions напрямую —
// получает коллбэк onSubmit через конструктор.

export class RecipeFormViewModel {
  title = ''
  ingredients: Ingredient[] = [{ name: '', amount: '', unit: '' }]
  steps: Step[] = [{ order: 1, text: '' }]
  cookTimeMinutes = ''
  servings = ''
  tags = ''
  isSubmitting = false
  error: string | null = null

  constructor(
    private readonly onSubmit: (data: CreateRecipeDTO) => Promise<void>,
    initialData?: Partial<CreateRecipeDTO>
  ) {
    makeAutoObservable(this)
    if (initialData) {
      this.title = initialData.title ?? ''
      this.ingredients = initialData.ingredients ?? [{ name: '', amount: '', unit: '' }]
      this.steps = initialData.steps ?? [{ order: 1, text: '' }]
      this.cookTimeMinutes = initialData.cookTimeMinutes?.toString() ?? ''
      this.servings = initialData.servings?.toString() ?? ''
      this.tags = initialData.tags?.join(', ') ?? ''
    }
  }

  setTitle(value: string) { this.title = value }
  setIngredientField(index: number, field: keyof Ingredient, value: string) {
    this.ingredients[index][field] = value
  }
  setStepText(index: number, value: string) {
    this.steps[index].text = value
  }

  addIngredient() {
    this.ingredients.push({ name: '', amount: '', unit: '' })
  }
  removeIngredient(index: number) {
    this.ingredients.splice(index, 1)
  }

  addStep() {
    this.steps.push({ order: this.steps.length + 1, text: '' })
  }
  removeStep(index: number) {
    this.steps.splice(index, 1)
    this.steps.forEach((s, i) => { s.order = i + 1 })
  }

  async submit() {
    this.isSubmitting = true
    this.error = null
    try {
      await this.onSubmit({
        title: this.title,
        ingredients: this.ingredients,
        steps: this.steps,
        cookTimeMinutes: this.cookTimeMinutes ? Number(this.cookTimeMinutes) : null,
        servings: this.servings ? Number(this.servings) : null,
        tags: this.tags.split(',').map(t => t.trim()).filter(Boolean),
        sourceUrl: null,
      })
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Произошла ошибка'
      })
    } finally {
      runInAction(() => { this.isSubmitting = false })
    }
  }
}
```

- [ ] **Step 9.2: Создай RecipeForm Client Component**

```typescript
// src/modules/recipes/ui/recipe-form.tsx
'use client'

import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { RecipeFormViewModel } from '../view-models/recipe-form.vm'
import type { CreateRecipeDTO } from '../transport/recipe.dto'

interface RecipeFormProps {
  onSubmit: (data: CreateRecipeDTO) => Promise<void>
  initialData?: Partial<CreateRecipeDTO>
}

// observer() подписывает компонент на MobX observable — аналог .use() из @foxford/vm.
// При любом изменении vm перерендерится только этот компонент, не родитель.

export const RecipeForm = observer(function RecipeForm({ onSubmit, initialData }: RecipeFormProps) {
  // useState с функцией-инициализатором создаёт VM один раз.
  // onSubmit — Server Action (стабильная ссылка), поэтому stale closure не проблема.
  const [vm] = useState(() => new RecipeFormViewModel(onSubmit, initialData))

  return (
    <form onSubmit={(e) => { e.preventDefault(); vm.submit() }} className="space-y-6">
      {vm.error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">{vm.error}</div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Название *</label>
        <input
          className="w-full border rounded-lg px-3 py-2"
          value={vm.title}
          onChange={e => vm.setTitle(e.target.value)}
          placeholder="Борщ украинский"
          required
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Ингредиенты *</label>
          <button type="button" onClick={() => vm.addIngredient()}
            className="text-sm text-blue-500 hover:underline">+ Добавить</button>
        </div>
        {vm.ingredients.map((ing, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="Название"
              value={ing.name} onChange={e => vm.setIngredientField(i, 'name', e.target.value)} />
            <input className="w-20 border rounded px-2 py-1 text-sm" placeholder="Кол-во"
              value={ing.amount} onChange={e => vm.setIngredientField(i, 'amount', e.target.value)} />
            <input className="w-16 border rounded px-2 py-1 text-sm" placeholder="Ед."
              value={ing.unit} onChange={e => vm.setIngredientField(i, 'unit', e.target.value)} />
            {vm.ingredients.length > 1 && (
              <button type="button" onClick={() => vm.removeIngredient(i)}
                className="text-red-400 hover:text-red-600">✕</button>
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium">Шаги приготовления *</label>
          <button type="button" onClick={() => vm.addStep()}
            className="text-sm text-blue-500 hover:underline">+ Добавить</button>
        </div>
        {vm.steps.map((step, i) => (
          <div key={i} className="flex gap-2 mb-2 items-start">
            <span className="text-gray-400 font-medium pt-2 min-w-[1.5rem]">{step.order}.</span>
            <textarea className="flex-1 border rounded px-2 py-1 text-sm" rows={2} placeholder="Описание шага"
              value={step.text} onChange={e => vm.setStepText(i, e.target.value)} />
            {vm.steps.length > 1 && (
              <button type="button" onClick={() => vm.removeStep(i)}
                className="text-red-400 hover:text-red-600 pt-2">✕</button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Время готовки (мин)</label>
          <input type="number" className="w-full border rounded px-3 py-2" min="1"
            value={vm.cookTimeMinutes} onChange={e => { vm.cookTimeMinutes = e.target.value }} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Порций</label>
          <input type="number" className="w-full border rounded px-3 py-2" min="1"
            value={vm.servings} onChange={e => { vm.servings = e.target.value }} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Теги (через запятую)</label>
        <input className="w-full border rounded px-3 py-2" placeholder="суп, украинская кухня"
          value={vm.tags} onChange={e => { vm.tags = e.target.value }} />
      </div>

      <button
        type="submit"
        disabled={vm.isSubmitting}
        className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {vm.isSubmitting ? 'Сохраняем...' : 'Сохранить рецепт'}
      </button>
    </form>
  )
})
```

- [ ] **Step 9.3: Создай страницу нового рецепта**

```typescript
// src/app/recipes/new/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import { createRecipeAction } from '@/app/actions/recipe.actions'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

export default function NewRecipePage() {
  const router = useRouter()

  async function handleSubmit(data: CreateRecipeDTO) {
    const result = await createRecipeAction(data)
    if ('error' in result) {
      throw new Error(JSON.stringify(result.error))
    }
    router.push(`/recipes/${result.data.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Новый рецепт</h1>
      <RecipeForm onSubmit={handleSubmit} />
    </div>
  )
}
```

- [ ] **Step 9.4: Проверь форму в браузере**

Открой `http://localhost:3000/recipes/new`. Заполни форму и сохрани. После сохранения должен быть редирект на страницу рецепта. Вернись на главную — рецепт должен появиться в списке.

- [ ] **Step 9.5: Закоммить**

```bash
git add src/modules/recipes/view-models/ src/modules/recipes/ui/recipe-form.tsx src/app/recipes/
git commit -m "feat: add MobX RecipeFormViewModel and new recipe Client Component"
```

---

## Task 10: Форма редактирования и удаление

**Что изучаешь:** prefilling формы существующими данными, `useOptimistic` для мгновенного UI при удалении.

**Files:**
- Create: `src/app/(recipes)/[id]/edit/page.tsx`

- [ ] **Step 10.1: Создай страницу редактирования**

```typescript
// src/app/(recipes)/[id]/edit/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RecipeForm } from '@/modules/recipes/ui/recipe-form'
import { getRecipeByIdAction, updateRecipeAction, deleteRecipeAction } from '@/app/actions/recipe.actions'
import type { RecipeEntity } from '@/modules/recipes/entities/recipe.entity'
import type { CreateRecipeDTO } from '@/modules/recipes/transport/recipe.dto'

interface EditPageProps {
  params: Promise<{ id: string }>
}

export default function EditRecipePage({ params }: EditPageProps) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<RecipeEntity | null>(null)

  useEffect(() => {
    params.then(p => {
      setId(p.id)
      getRecipeByIdAction(p.id).then(setRecipe)
    })
  }, [params])

  async function handleSubmit(data: CreateRecipeDTO) {
    if (!id) return
    const result = await updateRecipeAction(id, data)
    if ('error' in result) throw new Error(JSON.stringify(result.error))
    router.push(`/recipes/${id}`)
  }

  async function handleDelete() {
    if (!id || !confirm('Удалить рецепт?')) return
    await deleteRecipeAction(id)
    router.push('/')
  }

  if (!recipe) return <div className="text-center py-16 text-gray-400">Загрузка...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Редактировать рецепт</h1>
        <button onClick={handleDelete} className="text-red-500 hover:underline text-sm">
          Удалить
        </button>
      </div>
      <RecipeForm
        onSubmit={handleSubmit}
        initialData={{
          title: recipe.title,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
          cookTimeMinutes: recipe.cookTimeMinutes ?? undefined,
          servings: recipe.servings ?? undefined,
          tags: recipe.tags,
          sourceUrl: recipe.sourceUrl ?? undefined,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 10.2: Проверь полный цикл CRUD**

1. Создай рецепт через `/recipes/new`
2. Проверь детальную страницу
3. Нажми "Редактировать" — измени название
4. Сохрани — убедись, что изменение отражается на странице
5. Нажми "Удалить" — убедись, что рецепт исчез из списка

- [ ] **Step 10.3: Закоммить**

```bash
git add src/app/(recipes)/[id]/edit/
git commit -m "feat: add edit and delete recipe pages"
```

---

## Task 11: Финальная проверка и root layout

**Что изучаешь:** Next.js root layout — HTML-обёртка всего приложения, базовая навигация.

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 11.1: Обнови root layout**

```typescript
// src/app/layout.tsx
import 'reflect-metadata'
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Cook Book',
  description: 'Персональная книга рецептов',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={geist.className}>
        <header className="border-b">
          <div className="container mx-auto px-4 py-3 max-w-6xl flex justify-between items-center">
            <Link href="/" className="font-bold text-lg">📖 Cook Book</Link>
            <Link href="/recipes/new" className="text-sm text-gray-500 hover:text-black transition-colors">
              + Добавить рецепт
            </Link>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 11.2: Финальный запуск**

```bash
docker compose up -d postgres minio
pnpm dev
```

Проверь:
- `http://localhost:3000` — список рецептов (пустой или с рецептами)
- `http://localhost:3000/recipes/new` — форма создания
- Создай рецепт, проверь детальную страницу, отредактируй, удали

- [ ] **Step 11.3: Прогони все тесты**

```bash
pnpm test:run
```

Ожидаемый вывод: все тесты зелёные.

- [ ] **Step 11.4: Итоговый коммит**

```bash
git add src/app/layout.tsx
git commit -m "feat: complete Plan 1 - full recipe CRUD with layered architecture"
```

---

## Итог Plan 1

После выполнения всех задач у тебя есть:

| Что работает | Как проверить |
|---|---|
| PostgreSQL + MinIO в Docker | `docker compose ps` |
| Drizzle migrations | `pnpm db:migrate` |
| Слоистая архитектура (Entity → Repo → Service → Action → Component) | структура `src/modules/` |
| Inversify DI | `src/lib/container.ts` |
| MobX ViewModel | `src/modules/recipes/view-models/` |
| Server Components (список, детали) | `http://localhost:3000` |
| Client Components + форма | `http://localhost:3000/recipes/new` |
| Unit тесты | `pnpm test:run` |

**Следующий план:** Plan 2 — Telegram Bot с grammY, DeepSeek-парсинг фото и текста.
