import { queueFlagSent, takeFlagSent } from './profile-announcement'

beforeEach(() => { takeFlagSent(null) })

test('Profile consumes a successful flag announcement once for its originating token', () => {
  queueFlagSent('token-a')
  expect(takeFlagSent('token-a')).toBe(true)
  expect(takeFlagSent('token-a')).toBe(false)
})

test.each(['token-b', null])('a different session (%s) discards an old announcement', (token) => {
  queueFlagSent('token-a')
  expect(takeFlagSent(token)).toBe(false)
  expect(takeFlagSent('token-a')).toBe(false)
})
