import { and, count, eq, getTableColumns, inArray, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db'
import { invitation, member, organization, user } from '@/db/auth-schema'
import { attempts, concepts, consents, items, jobRoles, learnerConcept, learnerItem, learnerTopic, learnerUnit, memberRoleAssignments, sessions, sources, topics, units } from '@/db/schema'
import { BKT, MASTERY, guessFor, update } from '@/lib/learning/bkt'
import { review } from '@/lib/learning/fsrs'
import { gradeAnswer } from '@/lib/learning/grade'
import { MAX_SOURCE_TEXT_CHARS } from '@/lib/limits'
import { ItemPayload } from '@/lib/llm/schemas'
import { createAuth } from '@/server/auth-core'
import { getEnv } from '@/server/env'
import { chunks, ensureConceptItems, httpError } from '@/server/helpers'
import { addRoleDocument, buildRoleCurriculum } from '@/server/role-curriculum'
import { LOCATION_LABEL_ALT, LOCATION_LABEL_HEIGHT, LOCATION_LABEL_SVG, LOCATION_LABEL_WIDTH } from './location-label'

const DAY = 86_400_000
const marker = 'northwind-logistics-v1'
const LABEL_ITEM_ID = 'northwind-demo-v1:label-item'
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
// The SOP's own critical steps: a numbered step opening with **Critical — label:**, up to the next step or heading.
// Whitespace is collapsed because the SOP is hard-wrapped and model quotes are not.
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()
const criticalSteps = (sop: string) => [...sop.matchAll(/^\d+\.\s+\*\*Critical — ([^:*]+):\*\*[\s\S]*?(?=^\d+\.\s|^#|(?![\s\S]))/gm)]
  .map((match) => ({ label: collapse(match[1]).toLowerCase(), text: collapse(match[0]) }))
const quotedIn = (quote: string | null, step: { text: string }) => !!quote && !!collapse(quote) && step.text.includes(collapse(quote))

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

  async function sopVersion() {
    const source = await db.select({ version: sources.version }).from(sources).where(eq(sources.id, NORTHWIND.sourceId)).get()
    if (!source) throw httpError('The demo SOP was not stored.', 503)
    return source.version
  }
  // One correct practice attempt per concept with a gradable question, so progress counts every practiced concept as measured.
  async function practiceBackfill(progress: { learnerId: string; conceptId: string; pKnown: number }[], practiced: { learnerId: string; conceptId: string }[] = []) {
    const learners = [
      { key: 'onboarding', id: metadata.accounts.onboarding!, at: metadata.fixtureAt - DAY - 60_000 },
      { key: 'proficient', id: metadata.accounts.proficient!, at: metadata.fixtureAt - 4 * DAY - 60_000 },
    ]
    const [itemRows, attempted] = await Promise.all([
      db.select({ id: items.id, conceptId: items.conceptId, format: items.format, payloadJson: items.payloadJson }).from(items)
        .where(and(eq(items.topicId, NORTHWIND.topicId), eq(items.status, 'active'), inArray(items.format, ['mcq', 'cloze'])))
        .orderBy(sql`${items.format} <> 'mcq'`, items.createdAt, items.id),
      db.select({ learnerId: attempts.learnerId, conceptId: attempts.conceptId }).from(attempts).where(inArray(attempts.learnerId, learners.map((l) => l.id))),
    ])
    const answers = new Map<string, { itemId: string; answer: { optionId: string } | { text: string } }>()
    for (const item of itemRows) {
      if (answers.has(item.conceptId)) continue
      const payload = JSON.parse(item.payloadJson) as import('@/lib/llm/schemas').ItemPayload
      const option = payload.options.find((o) => o.is_correct)
      const text = payload.accepted_answers[0]
      if (item.format === 'mcq' ? option : text) answers.set(item.conceptId, { itemId: item.id, answer: item.format === 'mcq' ? { optionId: option!.id } : { text } })
    }
    const done = new Set([...attempted, ...practiced].map((a) => `${a.learnerId}:${a.conceptId}`))
    const rows = learners.flatMap((learner) => progress.flatMap((p) => {
      const chosen = answers.get(p.conceptId)
      if (p.learnerId !== learner.id || !chosen || done.has(`${p.learnerId}:${p.conceptId}`)) return []
      return [{
        id: `northwind-demo-v1:backfill-${learner.key}-${p.conceptId}`, learnerId: learner.id, sessionId: null, itemId: chosen.itemId, conceptId: p.conceptId,
        at: learner.at, answerJson: JSON.stringify(chosen.answer), correct: true, score: 1, confidence: 'sure' as const, responseMs: 4000, rating: 3,
        pKnownBefore: p.pKnown, pKnownAfter: p.pKnown, retrievabilityBefore: 0,
      }]
    }))
    return chunks(rows, 6).map((r) => db.insert(attempts).values(r).onConflictDoNothing())
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
    // Earlier seeds stored the topic without its company, so the question queue never saw its concepts.
    await db.update(topics).set({ orgId: org.id }).where(and(eq(topics.id, NORTHWIND.topicId), isNull(topics.orgId),
      inArray(topics.jobRoleId, db.select({ id: jobRoles.id }).from(jobRoles).where(eq(jobRoles.orgId, org.id)))))
    if (metadata.complete) {
      await addRoleDocument({ orgId: org.id, roleId: NORTHWIND.roleId, id: NORTHWIND.sourceId, title: 'Warehouse picker SOP', bodyText: data.sopText })
      // Earlier seeds stored the label question without its document, so retiring the SOP left it live.
      await db.update(items).set({ sourceId: NORTHWIND.sourceId, sourceVersion: await sopVersion() })
        .where(and(eq(items.id, LABEL_ITEM_ID), isNull(items.sourceId), isNull(items.sourceVersion)))
      const progress = await db.select().from(learnerConcept)
        .where(inArray(learnerConcept.learnerId, [metadata.accounts.onboarding!, metadata.accounts.proficient!]))
      const backfill = await practiceBackfill(progress)
      if (backfill.length) await db.batch(backfill as [typeof backfill[number], ...typeof backfill])
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
  if ((role && (role.orgId !== org.id || role.name !== 'Warehouse picker')) || (topic && (topic.jobRoleId !== NORTHWIND.roleId || topic.orgId !== org.id))) {
    throw httpError('A reserved Northwind role or topic id is already in use.', 409)
  }
  if (!role && !topic) {
    await db.batch([
      db.insert(jobRoles).values({ id: NORTHWIND.roleId, orgId: org.id, name: 'Warehouse picker', benchmark: 0.85, onboardingDays: 14, createdAt: now - 10 * DAY }),
      db.insert(topics).values({ id: NORTHWIND.topicId, orgId: org.id, jobRoleId: NORTHWIND.roleId, title: 'Warehouse picker', status: 'draft', createdAt: now - 10 * DAY }),
    ])
  } else if (!role || !topic) throw httpError('The demo role and topic are incomplete; no existing data was overwritten.', 409)

  await addRoleDocument({ orgId: org.id, roleId: NORTHWIND.roleId, id: NORTHWIND.sourceId, title: 'Warehouse picker SOP', bodyText: data.sopText })
  if (topic?.status !== 'ready') await buildRoleCurriculum({ orgId: org.id, ownerId: metadata.accounts.owner, roleId: NORTHWIND.roleId })
  // The SOP's markers decide which steps are critical, whatever the curriculum model flagged; the role page can still change them.
  const steps = criticalSteps(data.sopText)
  const quoted = await db.select({ id: concepts.id, sourceQuote: concepts.sourceQuote }).from(concepts).where(eq(concepts.topicId, NORTHWIND.topicId))
  const criticalIds = quoted.filter((c) => steps.some((step) => quotedIn(c.sourceQuote, step))).map((c) => c.id)
  await db.batch([
    db.update(concepts).set({ critical: false }).where(eq(concepts.topicId, NORTHWIND.topicId)),
    ...chunks(criticalIds, 90).map((ids) => db.update(concepts).set({ critical: true }).where(and(eq(concepts.topicId, NORTHWIND.topicId), inArray(concepts.id, ids)))),
  ])
  const readyTopic = await db.select().from(topics).where(eq(topics.id, NORTHWIND.topicId)).get()
  const conceptRows = await db.select(getTableColumns(concepts)).from(concepts).innerJoin(units, eq(units.id, concepts.unitId))
    .where(eq(concepts.topicId, NORTHWIND.topicId)).orderBy(units.order, concepts.order)
  const mismatchStep = steps.find((step) => step.label === 'resolve a scan mismatch')
  const critical = (mismatchStep && conceptRows.find((c) => c.grounded && quotedIn(c.sourceQuote, mismatchStep)))
    ?? conceptRows.find((c) => c.critical && c.grounded && /scan/i.test(c.name) && /mismatch/i.test(c.name))
  if (!readyTopic || !critical) throw httpError('The generated SOP curriculum needs a grounded critical scanning step before this demo can be seeded.', 422)

  // Three representative concepts keep generation within the normal daily cap.
  const selected = [critical, ...conceptRows.filter((c) => c.id !== critical.id).slice(0, 2)]
  for (const concept of selected) {
    const stored = await db.select({ id: items.id, format: items.format }).from(items).where(and(eq(items.conceptId, concept.id), eq(items.status, 'active'), ne(items.id, LABEL_ITEM_ID)))
    // The demo error needs a multiple-choice question, so a rerun regenerates until the self-check keeps one.
    const missing = concept.id === critical.id ? !stored.some((item) => item.format === 'mcq') : !stored.length
    if (missing) await ensureConceptItems(db, metadata.accounts.owner, concept, readyTopic, { targetDifficulty: 3, unseen: new Set(stored.map((item) => item.id)) })
  }
  const criticalItems = await db.select().from(items).where(and(eq(items.conceptId, critical.id), eq(items.status, 'active'), ne(items.id, LABEL_ITEM_ID)))
  const criticalItem = criticalItems.find((item) => item.format === 'mcq')
  if (!criticalItem) throw httpError('The critical scanning step needs a multiple-choice question for the demo error.', 422)
  const payload = JSON.parse(criticalItem.payloadJson) as import('@/lib/llm/schemas').ItemPayload
  const wrongOption = payload.options.find((option) => !option.is_correct)!
  const answer = { optionId: wrongOption.id }
  if (gradeAnswer(payload, answer).correct) throw httpError('The demo answer must be incorrect.', 422)

  // One authored question with an image: the SVG goes to R2 under the item's key, the payload points at it.
  const labelPayload = ItemPayload.parse({
    format: 'mcq', stem: 'What level does the label A12-04-C-2 point to?',
    options: [
      { id: 'a', text: 'Level A', is_correct: false, feedback: 'A12 is the aisle, the first part of the label, not the level.' },
      { id: 'b', text: 'Level C', is_correct: true, feedback: 'Correct: the third part of A12-04-C-2 is the level, C.' },
      { id: 'c', text: 'Level 2', is_correct: false, feedback: 'The final 2 is the position on that level, not the level.' },
      { id: 'd', text: 'Level 57', is_correct: false, feedback: '57 is the check digits boxed on the label, used to confirm the scan.' },
    ],
    accepted_answers: [], model_answer: '', explanation: 'Read the label as aisle A12, bay 04, level C, position 2; the boxed 57 is the check digits.',
    difficulty: 2, source_quote: null, grounded: false, bloom: 'understand',
    image: { key: 'label.svg', alt: LOCATION_LABEL_ALT, width: LOCATION_LABEL_WIDTH, height: LOCATION_LABEL_HEIGHT },
  })
  await getEnv().MEDIA.put(`items/${LABEL_ITEM_ID}/label.svg`, LOCATION_LABEL_SVG, { httpMetadata: { contentType: 'image/svg+xml' } })
  await db.insert(items).values({
    id: LABEL_ITEM_ID, conceptId: critical.id, topicId: NORTHWIND.topicId, format: 'mcq', payloadJson: JSON.stringify(labelPayload),
    difficultyPrior: 2, sourceId: NORTHWIND.sourceId, sourceVersion: await sopVersion(), status: 'active', createdAt: now - 10 * DAY,
  }).onConflictDoNothing()

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
  const backfill = await practiceBackfill(mastery, [onboardingId, proficientId].map((learnerId) => ({ learnerId, conceptId: critical.id })))
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
    ...backfill,
  ])
  metadata.complete = true
  await saveMetadata()
  return summary()
}
