import { describe, expect, it } from 'vitest'
import { checkFailedMessage, slowAfterMs } from './system-copy'

describe('checkFailedMessage', () => {
  it.each([
    [true, 'phone', 'Couldn’t check your answer. It’s saved on this phone.'],
    [true, 'device', 'Couldn’t check your answer. It’s saved on this device.'],
    [false, 'phone', 'Couldn’t check your answer.'],
    [false, 'device', 'Couldn’t check your answer.'],
  ] as const)('returns the message for saved=%s on %s', (saved, device, expected) => {
    expect(checkFailedMessage(saved, device)).toBe(expected)
  })
})

describe('slowAfterMs', () => {
  it.each([
    ['session', 15000],
    ['placement', 45000],
  ] as const)('returns the delay for %s', (start, expected) => {
    expect(slowAfterMs(start)).toBe(expected)
  })
})
