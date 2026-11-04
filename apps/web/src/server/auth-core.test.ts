import { beforeEach, expect, it, vi } from 'vitest'
import { getEnv } from '@/server/env'
import { createAuth } from './auth-core'

vi.mock('@/server/env', () => ({ getEnv: vi.fn() })) // cloudflare:workers does not exist under vitest
vi.mock('@/db', () => ({ getDb: () => ({}), authSchema: {} }))

beforeEach(() => vi.mocked(getEnv).mockReset())

function authFor(url: string) {
  vi.mocked(getEnv).mockReturnValue({ BETTER_AUTH_URL: url, BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long' } as never)
  return createAuth().options
}

it('trusts only the app host and shares the cookie across subdomains', () => {
  const options = authFor('https://app.learnquiz.com')
  expect(options.trustedOrigins).toEqual(['https://app.learnquiz.com'])
  expect(options.advanced?.crossSubDomainCookies).toEqual({ enabled: true, domain: 'learnquiz.com' })
})

it('keeps local development on a host-only cookie', () => {
  const options = authFor('http://localhost:3000')
  expect(options.trustedOrigins).toEqual(['http://localhost:3000', 'https://app.learnquiz.com'])
  expect(options.advanced?.crossSubDomainCookies).toBeUndefined()
})
