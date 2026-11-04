// Pure helpers for the push settings form.
import { formatMinute } from './schedule'

// Matches the server's getPushSettings `company` field.
export type CompanyWindow = { name: string; startMinute: number; endMinute: number; days: number[]; timezone: string }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// 30-minute steps from the clamped lower bound (company hours may start off the half hour) up to the clamped upper bound, inclusive.
export function timeOptions(company: CompanyWindow | null, min: number, max: number) {
	const low = Math.max(min, company?.startMinute ?? 0)
	const high = Math.min(max, company?.endMinute ?? 1440)
	const options: { value: number; label: string }[] = []
	for (let value = low; value <= high; value += 30) options.push({ value, label: formatMinute(value) })
	return options
}

// ISO weekday (1 to 7) as a short name.
export function weekdayLabel(isoDay: number) {
	return WEEKDAYS[isoDay - 1]
}

// The last day on cannot be turned off; turning a day on is always fine.
export function canToggleDay(days: number[], day: number) {
	return !(days.length === 1 && days[0] === day)
}
