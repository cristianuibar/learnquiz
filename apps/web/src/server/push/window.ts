import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { PushWindow } from '@learnquiz/api/schedule'
import type { Db } from '@/db'
import { member, organization } from '@/db/auth-schema'
import { jobRoles, memberRoleAssignments, orgSettings } from '@/db/schema'
import { defaultWorkingHours, type WorkingHours } from '@/lib/company-settings'

export type CompanyHours = { timezone: string; workingHours: WorkingHours }
export type LearnerPrefs = { startMinute: number; endMinute: number; timezone: string; days: number[] | null }
export type RoleProgress = { assignedAt: number; onboardingDays: number; proficientAt: number | null }

export const ONBOARDING_CAP = 6
export const STEADY_CAP = 3
const DAY_MS = 86_400_000

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// The window pushes may be sent in: the company's hours, narrowed by the learner's own; non-members use theirs or 9-17 weekdays UTC.
export function effectiveWindow(company: CompanyHours | null, prefs: LearnerPrefs | null): PushWindow {
  if (!company) {
    if (prefs) return { startMinute: prefs.startMinute, endMinute: prefs.endMinute, days: prefs.days ?? [1, 2, 3, 4, 5], timezone: prefs.timezone, source: 'learner' }
    return { startMinute: 540, endMinute: 1020, days: [1, 2, 3, 4, 5], timezone: 'UTC', source: 'default' }
  }
  const { workingHours, timezone } = company
  const base = { startMinute: minutes(workingHours.start), endMinute: minutes(workingHours.end), days: workingHours.days, timezone }
  if (!prefs) return { ...base, source: 'company' }
  // Learner prefs have no zone of their own: their minutes are read in the company timezone, their days within the company's.
  // Days the company drops fall away; if none of the learner's days remain, no day is allowed rather than every company day.
  const days = prefs.days ? base.days.filter((day) => prefs.days!.includes(day)) : base.days
  const startMinute = Math.max(base.startMinute, prefs.startMinute)
  const endMinute = Math.min(base.endMinute, prefs.endMinute)
  const hoursOk = startMinute < endMinute
  const narrowed = (hoursOk && (startMinute !== base.startMinute || endMinute !== base.endMinute)) || days.length !== base.days.length
  return { ...base, ...(hoursOk ? { startMinute, endMinute } : {}), days, source: narrowed ? 'learner' : 'company' }
}

// True when `now` (epoch ms) falls on an allowed weekday and in [start, end) of the window's local time.
export function inWindow(window: PushWindow, now: number): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: window.timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(now))
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1
  const minute = Number(get('hour')) * 60 + Number(get('minute'))
  return window.days.includes(day) && window.startMinute <= minute && minute < window.endMinute
}

// Six a day while onboarding (until proficient or the role's onboarding days pass), then three.
export function capPolicy(role: RoleProgress | null, now: number): { dailyCap: number; steadyCap: number; phase: 'onboarding' | 'steady' } {
  const onboarding = role !== null && role.proficientAt === null && now < role.assignedAt + role.onboardingDays * DAY_MS
  return { dailyCap: onboarding ? ONBOARDING_CAP : STEADY_CAP, steadyCap: STEADY_CAP, phase: onboarding ? 'onboarding' : 'steady' }
}

// The learner's company hours and role progress; null company for the personal edition.
export async function pushContext(db: Db, userId: string): Promise<{ company: (CompanyHours & { name: string }) | null; role: RoleProgress | null }> {
  const row = await db.select({
    name: orgSettings.companyName,
    orgName: organization.name,
    timezone: orgSettings.timezone,
    workingHours: orgSettings.workingHours,
    assignedAt: memberRoleAssignments.assignedAt,
    onboardingDays: jobRoles.onboardingDays,
    proficientAt: memberRoleAssignments.proficientAt,
    roleId: jobRoles.id,
  })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .leftJoin(orgSettings, eq(orgSettings.orgId, member.organizationId))
    .leftJoin(memberRoleAssignments, and(eq(memberRoleAssignments.userId, member.userId), eq(memberRoleAssignments.orgId, member.organizationId)))
    .leftJoin(jobRoles, and(eq(jobRoles.id, memberRoleAssignments.jobRoleId), eq(jobRoles.orgId, memberRoleAssignments.orgId), eq(jobRoles.status, 'active')))
    .where(eq(member.userId, userId))
    // Orgs with an active role first (newest assignment), then the earliest membership.
    .orderBy(sql`${jobRoles.id} is null`, desc(memberRoleAssignments.assignedAt), asc(member.createdAt), asc(member.id))
    .get()
  if (!row) return { company: null, role: null }
  return {
    company: { name: row.name ?? row.orgName, timezone: row.timezone ?? 'UTC', workingHours: row.workingHours ?? defaultWorkingHours },
    role: row.roleId === null ? null : { assignedAt: row.assignedAt!, onboardingDays: row.onboardingDays!, proficientAt: row.proficientAt },
  }
}
