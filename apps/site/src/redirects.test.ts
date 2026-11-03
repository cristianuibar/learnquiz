import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { signInUrl } from './site-config'

const appOrigin = new URL(signInUrl).origin

const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((line) => {
    const [source, target, status] = line.trim().split(/\s+/)
    return { source, target, status: Number(status) }
  })

function redirect(path: string) {
  for (const rule of redirects) {
    const wildcard = rule.source.endsWith('*')
    const prefix = wildcard ? rule.source.slice(0, -1) : rule.source
    if (wildcard ? path.startsWith(prefix) : path === prefix) {
      return { target: rule.target.replace(':splat', path.slice(prefix.length)), status: rule.status }
    }
  }
}

describe('app redirects', () => {
  it.each(redirects)('preserves the prefix and nested path for $source', ({ source }) => {
    const path = source.replaceAll('*', 'abc/nested')
    expect(redirect(path)).toEqual({ target: `${appOrigin}${path}`, status: 308 })
  })

  it.each([
    '/join/abc', '/play/abc', '/t/abc', '/org/abc', '/me/abc', '/admin/abc', '/api/abc', '/media/abc',
    '/me', '/admin', '/sign-in', '/today', '/welcome', '/start', '/opt-in',
  ])('sends %s to the same path in the app', (path) => {
    expect(redirect(path)).toEqual({ target: `${appOrigin}${path}`, status: 308 })
  })
})
