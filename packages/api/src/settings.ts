// Pure helpers for the push settings form.
import { formatMinute } from './schedule'

// Matches the server's getPushSettings `company` field.
export type CompanyWindow = { name: string; startMinute: number; endMinute: number; days: number[]; timezone: string }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// 30-minute steps from the clamped lower bound (company hours may start off the half hour) up to the clamped upper bound, inclusive.
// The upper bound and the saved value are always listed, even off the 30-minute steps, so a valid saved time stays selected.
export function timeOptions(company: CompanyWindow | null, min: number, max: number, selected?: number) {
	const low = Math.max(min, company?.startMinute ?? 0)
	const high = Math.min(max, company?.endMinute ?? 1440)
	const values = new Set<number>()
	for (let value = low; value <= high; value += 30) values.add(value)
	if (high >= low) values.add(high)
	if (selected !== undefined && selected >= low && selected <= high) values.add(selected)
	return [...values].sort((a, b) => a - b).map((value) => ({ value, label: formatMinute(value) }))
}

// Saved hours can predate a narrower company window: pull both bounds inside it, at least 30 minutes apart.
export function clampHours(company: CompanyWindow | null, startMinute: number, endMinute: number) {
	if (!company) return { startMinute, endMinute }
	const start = Math.min(Math.max(startMinute, company.startMinute), company.endMinute - 30)
	return { startMinute: start, endMinute: Math.min(Math.max(endMinute, start + 30), company.endMinute) }
}

// ISO weekday (1 to 7) as a short name.
export function weekdayLabel(isoDay: number) {
	return WEEKDAYS[isoDay - 1]
}

// The last day on cannot be turned off; turning a day on is always fine.
export function canToggleDay(days: number[], day: number) {
	return !(days.length === 1 && days[0] === day)
}
