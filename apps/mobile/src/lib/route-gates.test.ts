import { canOpenTarget, homeTarget, targetFromURL } from './route-gates'

const loading = { status: 'loading' as const, needsDisclosure: false }
const signedOut = { status: 'signedOut' as const, needsDisclosure: false }
const disclosure = { status: 'ready' as const, needsDisclosure: true }
const ready = { status: 'ready' as const, needsDisclosure: false }

test.each(['/today', '/(tabs)/profile', '/path', '/play/session-1', '/play/session-1/done',
  '/play/quick/item-1', '/play/loading', '/opt-in', '/settings', '/unit/unit-1', '/flag']) (
  '%s requires a signed-in, disclosed session', (target) => {
    expect(canOpenTarget(target, loading)).toBe(false)
    expect(canOpenTarget(target, signedOut)).toBe(false)
    expect(canOpenTarget(target, disclosure)).toBe(false)
    expect(canOpenTarget(target, ready)).toBe(true)
  },
)

test('keeps invitations public and sign-in and welcome behind their gates', () => {
  for (const state of [loading, signedOut, disclosure, ready]) {
    expect(canOpenTarget('/join/invite-1', state)).toBe(true)
  }
  expect(canOpenTarget('/(auth)/sign-in', signedOut)).toBe(true)
  expect(canOpenTarget('/sign-in', ready)).toBe(false)
  expect(canOpenTarget('/welcome', signedOut)).toBe(false)
  expect(canOpenTarget('/welcome', disclosure)).toBe(true)
  expect(canOpenTarget('https://example.com', ready)).toBe(false)
})

test('maps native, development and universal links to internal targets with their query', () => {
  expect(targetFromURL('learnquiz://play/s1?from=notification')).toBe('/play/s1?from=notification')
  expect(targetFromURL('learnquiz:///unit/u1')).toBe('/unit/u1')
  expect(targetFromURL('exp://localhost:8081/--/settings')).toBe('/settings')
  expect(targetFromURL('https://app.learnquiz.com/join/invite-1')).toBe('/join/invite-1')
  expect(targetFromURL('not a URL')).toBeNull()
  expect(targetFromURL('learnquiz://unrecognized')).toBeNull()
})

test('selects the entry route from the session gates', () => {
  expect(homeTarget(signedOut)).toBe('/(auth)/sign-in')
  expect(homeTarget(disclosure)).toBe('/welcome')
  expect(homeTarget(ready)).toBe('/(tabs)/today')
})

test('does not hold a Facebook callback as a post-auth destination', () => {
  expect(targetFromURL('learnquiz://sign-in?facebookState=state&facebookCode=code')).toBeNull()
  expect(targetFromURL('learnquiz://sign-in?facebookState=state&facebookError=cancelled')).toBeNull()
})
