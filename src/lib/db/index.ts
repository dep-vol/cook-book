import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/modules/recipes/db/recipe.schema'

const connectionString = process.env.DATABASE_URL!

// В Next.js hot-reload пересоздаёт модули в development.
// globalThis переживает hot reload — используем для singleton DB-пула.
declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined
}

const client = globalThis._pgClient ?? postgres(connectionString)
if (process.env.NODE_ENV !== 'production') globalThis._pgClient = client

export const db = drizzle(client, { schema })
