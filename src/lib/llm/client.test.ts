import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { modelCalls } from '@/db/schema'
import { chatJson, LlmError } from './client'

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/db', () => ({ getDb: () => holder.db }))
vi.mock('cloudflare:workers', () => ({
  env: { LLM_PROFILE: 'meta', LLM_BASE_URL: 'https://llm.example', LLM_MODEL: 'muse-spark-1.3' },
}))

it('refuses a malformed-output retry after the twentieth daily model call', async () => {
  const raw = new DatabaseSync(':memory:')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
  try {
    const ddl = readFileSync(new URL('../../../drizzle/0000_scaffold.sql', import.meta.url), 'utf8')
    raw.exec(ddl.replaceAll('--> statement-breakpoint', ''))
    // Reuse the SQLite proxy convention from play.test.ts; queries and logs run for real.
    const db = drizzle(async (sql, params, method) => {
      const stmt = raw.prepare(sql)
      ;(stmt as unknown as { setReturnArrays: (value: boolean) => void }).setReturnArrays(true)
      if (method === 'run') {
        stmt.run(...params)
        return { rows: [] }
      }
      return { rows: stmt.all(...params) as unknown as unknown[][] }
    })
    holder.db = db
    await db.insert(modelCalls).values(Array.from({ length: 19 }, (_, i) => ({
      id: `call-${i}`,
      learnerId: 'u1',
      purpose: 'test',
      model: 'muse-spark-1.3',
      latencyMs: 0,
      ok: true,
      createdAt: Date.now(),
    })))
    const fetchModel = vi.fn(async () => Response.json({
      choices: [{ message: { content: 'not JSON' }, finish_reason: 'stop' }],
    }))
    vi.stubGlobal('fetch', fetchModel)

    const error = await chatJson({
      purpose: 'test',
      schema: z.object({ answer: z.string() }),
      schemaName: 'answer',
      system: 'Return JSON.',
      user: 'Answer the question.',
      learnerId: 'u1',
    }).catch((e: unknown) => e)

    expect(fetchModel).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(LlmError)
    expect(error).toMatchObject({ status: 429 })
    const calls = await db.select().from(modelCalls)
    expect(calls).toHaveLength(20)
    expect(calls.filter((call) => !call.ok)).toEqual([
      expect.objectContaining({ learnerId: 'u1', error: expect.stringContaining('invalid JSON:') }),
    ])
  } finally {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    raw.close()
  }
})
