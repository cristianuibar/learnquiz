import { expect, it } from 'vitest'
import { describeWindow, formatMinute, type PushWindow } from './schedule'

const window = (startMinute: number, endMinute: number, days: number[]): PushWindow => ({ startMinute, endMinute, days, timezone: 'UTC', source: 'default' })

it.each([
	[window(360, 1080, [1, 2, 3, 4, 5]), '6:00 AM–6:00 PM, Monday to Friday'],
	[window(540, 1020, [5, 1, 2, 4]), '9:00 AM–5:00 PM, Monday, Tuesday, Thursday and Friday'],
	[window(720, 1440, [6, 7]), '12:00 PM–12:00 AM, Saturday and Sunday'],
	[window(30, 750, [3]), '12:30 AM–12:30 PM, Wednesday'],
	[window(0, 1440, [1, 2, 3, 4, 5, 6, 7]), '12:00 AM–12:00 AM, Monday to Sunday'],
	[window(540, 1020, []), '9:00 AM–5:00 PM, no days'],
])('describes %o as %s', (value, expected) => {
	expect(describeWindow(value)).toBe(expected)
})

it.each([[0, '12:00 AM'], [30, '12:30 AM'], [359, '5:59 AM'], [720, '12:00 PM'], [1439, '11:59 PM']])('formats minute %i as %s', (minute, expected) => {
	expect(formatMinute(minute)).toBe(expected)
})
