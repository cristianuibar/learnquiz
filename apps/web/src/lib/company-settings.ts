import { brandProblem } from '@learnquiz/tokens'
import { z } from 'zod'

export function accessibleAccent(colour: string) {
  return brandProblem(colour) === null
}

// ISO weekdays: Monday is 1, Sunday is 7; times are local to the company timezone.
export const WorkingHours = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1, 'Choose at least one working day').max(7).refine((days) => new Set(days).size === days.length, 'Choose each day once'),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid start time'),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid end time'),
}).refine(({ start, end }) => start < end, 'Working hours must end after they start')

export type WorkingHours = z.infer<typeof WorkingHours>
export const defaultWorkingHours: WorkingHours = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }

export const CompanySettings = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(1).max(100).refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true } catch { return false }
  }, 'Choose a valid timezone, such as Europe/London'),
  workingHours: WorkingHours,
  accent: z.string().nullable().superRefine((value, ctx) => {
    const problem = value === null ? null : brandProblem(value)
    if (problem) ctx.addIssue({ code: 'custom', message: problem })
  }),
})
