import { expect, it } from 'vitest'
import { canToggleDay, type CompanyWindow, timeOptions, weekdayLabel } from './settings'

const company: CompanyWindow = { name: 'Acme', startMinute: 360, endMinute: 1080, days: [1, 2, 3, 4, 5], timezone: 'UTC' }

it.each([
	[company, 0, 1440, 25, '6:00 AM', '6:00 PM'],
	[company, 480, 960, 17, '8:00 AM', '4:00 PM'],
	[company, 300, 420, 3, '6:00 AM', '7:00 AM'],
	[null, 0, 1440, 49, '12:00 AM', '12:00 AM'],
	[null, 360, 1080, 25, '6:00 AM', '6:00 PM'],
])('lists time options for %o between %i and %i', (win, min, max, count, first, last) => {
	const options = timeOptions(win, min, max)
	expect(options).toHaveLength(count)
	expect(options[0].label).toBe(first)
	expect(options.at(-1)!.label).toBe(last)
})

it.each([[1, 'Mon'], [4, 'Thu'], [7, 'Sun']])('labels weekday %i as %s', (day, expected) => {
	expect(weekdayLabel(day)).toBe(expected)
})

it.each([
	[[3], 3, false],
	[[3], 4, true],
	[[3, 4], 3, true],
	[[1, 2, 3], 2, true],
])('canToggleDay(%o, %i) is %s', (days, day, expected) => {
	expect(canToggleDay(days, day)).toBe(expected)
})
