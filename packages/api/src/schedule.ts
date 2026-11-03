// The push schedule the opt-in copy states and the scheduler enforces; one source for both.

// Minutes from local midnight; days are ISO weekdays (Monday is 1, Sunday is 7).
export type PushWindow = {
	startMinute: number
	endMinute: number
	days: number[]
	timezone: string
	source: 'learner' | 'company' | 'default'
}

export type PushSchedule = {
	window: PushWindow
	dailyCap: number
	steadyCap: number
	phase: 'onboarding' | 'steady'
	preview: string | null
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// "6:00 AM", "12:30 AM"; 1440 (end of day) reads as midnight. No Intl, so it renders the same everywhere.
export function formatMinute(minute: number) {
	const hours = Math.floor(minute / 60) % 24
	const minutes = minute % 60
	return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

function describeDays(days: number[]) {
	const sorted = [...new Set(days)].sort((a, b) => a - b)
	const names = sorted.map((day) => DAY_NAMES[day - 1])
	if (sorted.length > 2 && sorted.at(-1)! - sorted[0] === sorted.length - 1) return `${names[0]} to ${names.at(-1)}`
	return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('')
}

// "6:00 AM–6:00 PM, Monday to Friday"
export function describeWindow(window: PushWindow) {
	return `${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}, ${describeDays(window.days)}`
}
