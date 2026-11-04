import { flagNoteValid, resultFlagBody, resultFlagOutcome } from './result-flag'

test('requires a non-blank note of at most 500 characters', () => {
  for (const note of ['', ' \n\t ', 'x'.repeat(501)]) expect(flagNoteValid(note)).toBe(false)
  expect(flagNoteValid('  The answer was right.  ')).toBe(true)
  expect(flagNoteValid('x'.repeat(500))).toBe(true)
})

test('builds only the concept and trimmed note, rejecting invalid input', () => {
  expect(resultFlagBody('concept-1', '  Please check this result.\n')).toEqual({
    conceptId: 'concept-1', note: 'Please check this result.',
  })
  for (const id of [undefined, '', '  ']) expect(resultFlagBody(id, 'A note')).toBeNull()
  expect(resultFlagBody('c', ' \n ')).toBeNull()
  expect(resultFlagBody('c', 'x'.repeat(501))).toBeNull()
})

test('only a confirmed response for the current request succeeds', () => {
  expect(resultFlagOutcome({ response: { ok: true } }, true)).toEqual({ kind: 'sent' })
  for (const response of [null, {}, { ok: false }]) {
    expect(resultFlagOutcome({ response }, true)).toEqual({ kind: 'error', message: 'Could not send your flag. Try again.' })
  }
  expect(resultFlagOutcome({ error: new Error('offline') }, true)).toEqual({ kind: 'error', message: 'Could not send your flag. Try again.' })
  expect(resultFlagOutcome({ error: { status: 401 } }, true)).toEqual({ kind: 'ignore' })
  expect(resultFlagOutcome({ response: { ok: true } }, false)).toEqual({ kind: 'ignore' })
  expect(resultFlagOutcome({ error: new Error('offline') }, false)).toEqual({ kind: 'ignore' })
})
