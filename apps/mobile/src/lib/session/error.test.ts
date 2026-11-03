import { checkFailedMessage, networkError } from '@learnquiz/api/system-copy'
import { sessionRefetchError, type SessionError } from './error'

test.each([true, false])('a failed foreground refetch preserves the failed-check state and its retry message (saved: %s)', (saved) => {
  const failedCheck: SessionError = { kind: 'check', message: checkFailedMessage(saved, 'phone') }
  const afterRefetch = sessionRefetchError(failedCheck)
  expect(afterRefetch).toBe(failedCheck)
  expect(afterRefetch.kind).toBe('check') // The dock keeps its Try again mode.
  expect(afterRefetch.message).toBe(checkFailedMessage(saved, 'phone'))
})

test.each<SessionError | null>([
  null,
  { kind: 'load', message: 'Previous load failure' },
  { kind: 'next', message: 'Previous next failure' },
])('a refetch failure without a failed Check shows the load error: %j', (current) => {
  expect(sessionRefetchError(current)).toEqual({ kind: 'load', message: networkError })
})
