import { and, count, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { invitation, member, organization, user } from '@/db/auth-schema'
import { attempts, concepts, consents, items, jobRoles, learnerConcept, learnerItem, learnerTopic, learnerUnit, memberRoleAssignments, sessions, topics, units } from '@/db/schema'
import { BKT, MASTERY, guessFor, update } from '@/lib/learning/bkt'
import { review } from '@/lib/learning/fsrs'
import { gradeAnswer } from '@/lib/learning/grade'
import { MAX_SOURCE_TEXT_CHARS } from '@/lib/limits'
import { createAuth } from '@/server/auth-core'
import { chunks, ensureConceptItems, httpError } from '@/server/helpers'
import { addRoleDocument, buildRoleCurriculum } from '@/server/role-curriculum'

const DAY = 86_400_000
const marker = 'northwind-logistics-v1'
export const NORTHWIND = {
  slug: 'northwind-logistics', roleId: 'northwind-demo-v1:picker', topicId: 'northwind-demo-v1:topic', sourceId: 'northwind-demo-v1:sop',
  emails: {
    owner: 'owner@northwind.learnquiz.test', invited: 'invited@northwind.learnquiz.test',
    onboarding: 'onboarding@northwind.learnquiz.test', proficient: 'proficient@northwind.learnquiz.test',
  },
} as const

const Input = z.object({
  sopText: z.string().trim().min(1).max(MAX_SOURCE_TEXT_CHARS),
  ownerPassword: z.string().min(8).max(128), learnerPassword: z.string().min(8).max(128),
  now: z.number().int().positive().optional(),
})
const Metadata = z.object({
  seed: z.literal(marker), accounts: z.object({ owner: z.string(), onboarding: z.string().optional(), proficient: z.string().optional() }),
  fixtureAt: z.number(), complete: z.boolean(),
})

// Run only from the seed command, never from the deployed application's routes.
export async function seedNorthwind(input: z.input<typeof Input>) {
  const data = Input.parse(input)
  const db = getDb()
  const auth = createAuth()
  let org = await db.select().from(organization).where(eq(organization.slug, NORTHWIND.slug)).get()
  let metadata: z.infer<typeof Metadata>

  function cookies(headers: Headers) {
    const values = headers.getSetCookie()
    if (!values.length) throw httpError('The demo sign-in did not return a session.', 503)
    return new Headers({ cookie: values.map((value) => value.split(';', 1)[0]).join('; ') })
  }
  async function signup(email: string, name: string, password: string) {
    const result = await auth.api.signUpEmail({ body: { email, name, password }, returnHeaders: true })
    return { id: result.response.user.id, headers: cookies(result.headers) }
  }
  async function signin(email: string, password: string) {
    const result = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
    return cookies(result.headers)
  }
  async function saveMetadata() {
    await db.update(organization).set({ metadata: JSON.stringify(metadata) }).where(eq(organization.id, org!.id))
  }
  async function summary() {
    const [conceptCount, questionCount, assignment] = await Promise.all([
      db.select({ n: count() }).from(concepts).where(eq(concepts.topicId, NORTHWIND.topicId)).get(),
      db.select({ n: count() }).from(items).where(and(eq(items.topicId, NORTHWIND.topicId), eq(items.status, 'active'))).get(),
      db.select({ assignedAt: memberRoleAssignments.assignedAt, proficientAt: memberRoleAssignments.proficientAt }).from(memberRoleAssignments)
        .where(and(eq(memberRoleAssignments.orgId, org!.id), eq(memberRoleAssignments.userId, metadata.accounts.proficient!))).get(),
    ])
    return {
      slug: NORTHWIND.slug, ownerEmail: NORTHWIND.emails.owner,
      employees: { invited: NORTHWIND.emails.invited, onboarding: NORTHWIND.emails.onboarding, proficient: NORTHWIND.emails.proficient },
      topicId: NORTHWIND.topicId, concepts: conceptCount!.n, questions: questionCount!.n,
      daysToProficiency: assignment?.proficientAt == null ? null : Math.max(0, Math.ceil((assignment.proficientAt - assignment.assignedAt) / DAY)),
    }
  }

  let ownerHeaders: Headers
  if (org) {
    let stored: unknown
    try { stored = JSON.parse(org.metadata ?? '') } catch { /* An unmarked company is never adopted. */ }
    const parsed = Metadata.safeParse(stored)
    if (!parsed.success || org.name !== 'Northwind Logistics') throw httpError('Northwind Logistics already exists without this demo marker. Nothing was changed.', 409)
    metadata = parsed.data
    for (const key of ['owner', 'onboarding', 'proficient'] as const) {
      const existing = await db.select().from(user).where(eq(user.email, NORTHWIND.emails[key])).get()
      if ((existing?.id ?? undefined) !== metadata.accounts[key]) throw httpError(`The reserved demo ${key} account differs from its recorded id.`, 409)
    }
    const owner = await db.select().from(member).where(and(eq(member.organizationId, org.id), eq(member.userId, metadata.accounts.owner), eq(member.role, 'owner'))).get()
    if (!owner) throw httpError('The recorded demo owner no longer owns this company.', 409)
    if (metadata.complete) {
      await addRoleDocument({ orgId: org.id, roleId: NORTHWIND.roleId, id: NORTHWIND.sourceId, title: 'Warehouse picker SOP', bodyText: data.sopText })
      return summary()
    }
    ownerHeaders = await signin(NORTHWIND.emails.owner, data.ownerPassword)
  } else {
    const existing = await db.select({ id: user.id }).from(user).where(inArray(user.email, Object.values(NORTHWIND.emails))).get()
    if (existing) throw httpError('A reserved Northwind demo email is already in use. Nothing was changed.', 409)
    const owner = await signup(NORTHWIND.emails.owner, 'Jordan Blake', data.ownerPassword)
    ownerHeaders = owner.headers
    metadata = { seed: marker, accounts: { owner: owner.id }, fixtureAt: data.now ?? Date.now(), complete: false }
    const created = await auth.api.createOrganization({ body: { name: 'Northwind Logistics', slug: NORTHWIND.slug, userId: owner.id, metadata } })
    org = await db.select().from(organization).where(eq(organization.id, created.id)).get()
    if (!org) throw httpError('The demo company was not stored.', 503)
  }

  const invitedUser = await db.select({ id: user.id }).from(user).where(eq(user.email, NORTHWIND.emails.invited)).get()
  if (invitedUser) throw httpError('The invited demo employee has already joined. The demo was not reset.', 409)
  const now = metadata.fixtureAt
  const role = await db.select().from(jobRoles).where(eq(jobRoles.id, NORTHWIND.roleId)).get()
  const topic = await db.select().from(topics).where(eq(topics.id, NORTHWIND.topicId)).get()
  if ((role && (role.orgId !== org.id || role.name !== 'Warehouse picker')) || (topic && topic.jobRoleId !== NORTHWIND.roleId)) {
    throw httpError('A reserved Northwind role or topic id is already in use.', 409)
  }
  if (!role && !topic) {
    await db.batch([
      db.insert(jobRoles).values({ id: NORTHWIND.roleId, orgId: org.id, name: 'Warehouse picker', benchmark: 0.85, onboardingDays: 14, createdAt: now - 10 * DAY }),
      db.insert(topics).values({ id: NORTHWIND.topicId, jobRoleId: NORTHWIND.roleId, title: 'Warehouse picker', status: 'draft', createdAt: now - 10 * DAY }),
    ])
  } else if (!role || !topic) throw httpError('The demo role and topic are incomplete; no existing data was overwritten.', 409)

  await addRoleDocument({ orgId: org.id, roleId: NORTHWIND.roleId, id: NORTHWIND.sourceId, title: 'Warehouse picker SOP', bodyText: data.sopText })
  if (topic?.status !== 'ready') await buildRoleCurriculum({ orgId: org.id, ownerId: metadata.accounts.owner, roleId: NORTHWIND.roleId })
  const readyTopic = await db.select().from(topics).where(eq(topics.id, NORTHWIND.topicId)).get()
  const conceptRows = await db.select().from(concepts).where(eq(concepts.topicId, NORTHWIND.topicId)).orderBy(concepts.unitId, concepts.order)
  const critical = conceptRows.find((c) => c.critical && c.grounded && /scan|mismatch/i.test(`${c.name} ${c.summary} ${c.sourceQuote}`))
  if (!readyTopic || !critical) throw httpError('The generated SOP curriculum needs a grounded critical scanning step before this demo can be seeded.', 422)

  // Three representative concepts keep generation within the normal daily cap.
  const selected = [critical, ...conceptRows.filter((c) => c.id !== critical.id).slice(0, 2)]
  for (const concept of selected) {
    const stored = await db.select({ id: items.id }).from(items).where(and(eq(items.conceptId, concept.id), eq(items.status, 'active'))).get()
    if (!stored) await ensureConceptItems(db, metadata.accounts.owner, concept, readyTopic, { targetDifficulty: 3 })
  }
  const criticalItems = await db.select().from(items).where(and(eq(items.conceptId, critical.id), eq(items.status, 'active')))
  const criticalItem = criticalItems.find((item) => item.format === 'mcq')
  if (!criticalItem) throw httpError('The critical scanning step needs a multiple-choice question for the demo error.', 422)
  const payload = JSON.parse(criticalItem.payloadJson) as import('@/lib/llm/schemas').ItemPayload
  const wrongOption = payload.options.find((option) => !option.is_correct)!
  const answer = { optionId: wrongOption.id }
  if (gradeAnswer(payload, answer).correct) throw httpError('The demo answer must be incorrect.', 422)

  async function invite(email: string, name: string) {
    const existing = await db.select().from(invitation).where(and(eq(invitation.organizationId, org!.id), eq(invitation.email, email), eq(invitation.status, 'pending'))).get()
    if (existing && existing.expiresAt.getTime() > Date.now()) return existing.id
    return (await auth.api.createInvitation({ headers: ownerHeaders, body: { organizationId: org!.id, email, role: 'member', jobRoleId: NORTHWIND.roleId, inviteeName: name, resend: true } })).id
  }
  await invite(NORTHWIND.emails.invited, 'Alex Rivera')
  async function join(key: 'onboarding' | 'proficient', name: string) {
    const email = NORTHWIND.emails[key]
    let id = metadata.accounts[key]
    let headers: Headers
    if (id) headers = await signin(email, data.learnerPassword)
    else {
      const created = await signup(email, name, data.learnerPassword)
      id = created.id
      headers = created.headers
      metadata.accounts[key] = id
      await saveMetadata()
    }
    const joined = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, org!.id), eq(member.userId, id))).get()
    if (!joined) await auth.api.acceptInvitation({ headers, body: { invitationId: await invite(email, name) } })
    return id
  }
  const onboardingId = await join('onboarding', 'Morgan Chen')
  const proficientId = await join('proficient', 'Sam Patel')
  const errorAt = now - DAY
  const proficientAt = now - 4 * DAY
  const errorBefore = 0.65
  const guess = guessFor('mcq', payload.options.length, 'sure')
  const errorAfter = update(errorBefore, false, guess)
  // Invert the BKT correct-answer update so this last step reaches the mastery target.
  const posterior = (MASTERY - BKT.T) / (1 - BKT.T)
  const proficientBefore = posterior * guess / ((1 - BKT.S) * (1 - posterior) + posterior * guess)
  const proficientAfter = update(proficientBefore, true, guess)
  const correctAnswer = { optionId: payload.options.find((option) => option.is_correct)!.id }
  const scheduled = review(null, false, 'sure', new Date(errorAt))
  const unitRows = await db.select({ id: units.id }).from(units).where(eq(units.topicId, NORTHWIND.topicId))
  const mastery = conceptRows.flatMap((concept, index) => [
    { learnerId: onboardingId, conceptId: concept.id, pKnown: concept.id === critical.id ? errorAfter : index < Math.ceil(conceptRows.length / 2) ? 0.9 : 0.35, nAttempts: 3, masteredAt: null, updatedAt: errorAt },
    { learnerId: proficientId, conceptId: concept.id, pKnown: concept.id === critical.id ? proficientAfter : MASTERY, nAttempts: 8, masteredAt: proficientAt, updatedAt: proficientAt },
  ])
  const errorSession = 'northwind-demo-v1:onboarding-session'
  const proficientSession = 'northwind-demo-v1:proficient-session'
  await db.batch([
    db.update(memberRoleAssignments).set({ assignedAt: now - 5 * DAY, proficientAt: null }).where(and(eq(memberRoleAssignments.userId, onboardingId), eq(memberRoleAssignments.orgId, org.id))),
    db.update(memberRoleAssignments).set({ assignedAt: now - 10 * DAY, proficientAt }).where(and(eq(memberRoleAssignments.userId, proficientId), eq(memberRoleAssignments.orgId, org.id))),
    ...chunks(mastery, 10).map((rows) => db.insert(learnerConcept).values(rows).onConflictDoNothing()),
    db.insert(learnerTopic).values([{ learnerId: onboardingId, topicId: NORTHWIND.topicId, level: 3, xp: 90, lastSessionAt: errorAt }, { learnerId: proficientId, topicId: NORTHWIND.topicId, level: 4, xp: 420, lastSessionAt: proficientAt }]).onConflictDoNothing(),
    ...chunks(unitRows.flatMap((unit) => [{ learnerId: onboardingId, unitId: unit.id, unlockedAt: now - 5 * DAY }, { learnerId: proficientId, unitId: unit.id, unlockedAt: now - 10 * DAY }]), 20).map((rows) => db.insert(learnerUnit).values(rows).onConflictDoNothing()),
    db.insert(consents).values([onboardingId, proficientId, metadata.accounts.owner].map((userId) => ({ userId, kind: 'disclosure-v1', acceptedAt: now - 10 * DAY }))).onConflictDoNothing(),
    db.insert(sessions).values([
      { id: errorSession, learnerId: onboardingId, topicId: NORTHWIND.topicId, kind: 'session', itemIdsJson: JSON.stringify([criticalItem.id]), startedAt: errorAt - 60_000, endedAt: errorAt, correctCount: 0, xp: 5 },
      { id: proficientSession, learnerId: proficientId, topicId: NORTHWIND.topicId, kind: 'session', itemIdsJson: JSON.stringify([criticalItem.id]), startedAt: proficientAt - 60_000, endedAt: proficientAt, correctCount: 1, xp: 20 },
    ]).onConflictDoNothing(),
    db.insert(attempts).values([
      { id: 'northwind-demo-v1:confident-error', learnerId: onboardingId, sessionId: errorSession, itemId: criticalItem.id, conceptId: critical.id, at: errorAt, answerJson: JSON.stringify(answer), correct: false, score: 0, confidence: 'sure', responseMs: 4500, rating: 1, pKnownBefore: errorBefore, pKnownAfter: errorAfter, retrievabilityBefore: scheduled.retrievabilityBefore },
      { id: 'northwind-demo-v1:proficient-answer', learnerId: proficientId, sessionId: proficientSession, itemId: criticalItem.id, conceptId: critical.id, at: proficientAt, answerJson: JSON.stringify(correctAnswer), correct: true, score: 1, confidence: 'sure', responseMs: 3800, rating: 3, pKnownBefore: proficientBefore, pKnownAfter: proficientAfter, retrievabilityBefore: 0 },
    ]).onConflictDoNothing(),
    db.insert(learnerItem).values({ learnerId: onboardingId, itemId: criticalItem.id, ...scheduled.next, lastWrongConfidentAt: errorAt }).onConflictDoNothing(),
  ])
  metadata.complete = true
  await saveMetadata()
  return summary()
}
