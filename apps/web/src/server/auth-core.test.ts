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

it.each(['https://app.learnquiz.com', 'https://learnquiz.com'])('trusts both hosts and shares the cookie across subdomains for %s', (url) => {
  const options = authFor(url)
  expect(options.trustedOrigins).toHaveLength(2)
  expect(options.trustedOrigins).toEqual(expect.arrayContaining(['https://app.learnquiz.com', 'https://learnquiz.com']))
  expect(options.advanced?.crossSubDomainCookies).toEqual({ enabled: true, domain: 'learnquiz.com' })
})

it('keeps local development on a host-only cookie', () => {
  const options = authFor('http://localhost:3000')
  expect(options.trustedOrigins).toEqual(['http://localhost:3000', 'https://app.learnquiz.com', 'https://learnquiz.com'])
  expect(options.advanced?.crossSubDomainCookies).toBeUndefined()
})
