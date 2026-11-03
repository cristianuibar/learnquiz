import { drizzle } from 'drizzle-orm/d1'
import { getEnv } from '@/server/env'
import * as schema from './schema'
import * as authSchema from './auth-schema'

export const dbSchema = { ...schema, ...authSchema }

// Per request: D1 bindings must not be captured at module load.
export function getDb() {
  return drizzle(getEnv().DB, { schema: dbSchema })
}

export type Db = ReturnType<typeof getDb>
export { schema, authSchema }
