import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { organization, user } from './auth-schema'
import type { WorkingHours } from '@/lib/company-settings'

// learner_id everywhere is the Better Auth user id (guest or Facebook). ids are crypto.randomUUID().
// Times are epoch milliseconds. JSON lives in *_json text columns.

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  learnerId: text('learner_id'), // Personal topics belong to a learner; company topics belong to a job role.
  orgId: text('org_id'), // Null in the personal edition.
  jobRoleId: text('job_role_id').unique().references(() => jobRoles.id),
  title: text('title').notNull(),
  goal: text('goal'),
  generatedBy: text('generated_by'),
  status: text('status', { enum: ['draft', 'generating', 'ready', 'failed'] }).notNull().default('generating'),
  // Claim time of a role curriculum build; a stale claim may be taken again.
  genStartedAt: integer('gen_started_at'),
  createdAt: integer('created_at').notNull(),
})

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
  kind: text('kind', { enum: ['text', 'url', 'pdf', 'image'] }).notNull(),
  title: text('title').notNull(),
  bodyText: text('body_text').notNull(),
  r2Key: text('r2_key'), // Uploaded original file, when there is one.
  sizeBytes: integer('size_bytes'), // Byte size of the uploaded file; null for pasted text.
  pageCount: integer('page_count'), // PDF page count; null for pasted text.
  version: integer('version').notNull().default(1),
  uploadedBy: text('uploaded_by'),
  status: text('status', { enum: ['processing', 'ready', 'failed'] }).notNull().default('ready'),
  error: text('error'),
  retiredAt: integer('retired_at'),
  deletedAt: integer('deleted_at'),
  createdAt: integer('created_at').notNull(),
})

export const units = sqliteTable('units', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
  order: integer('order').notNull(),
  name: text('name').notNull(),
  summary: text('summary').notNull().default(''),
  unlockedAt: integer('unlocked_at'),
  procedureJson: text('procedure_json'), // { sourceId, version, graph }: the unit's procedure flowchart, generated once per source version.
  procedureStartedAt: integer('procedure_started_at'), // Claim time of the flowchart generation; a stale claim may be taken again.
})

export const concepts = sqliteTable('concepts', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
  unitId: text('unit_id').notNull(),
  order: integer('order').notNull(),
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  level: integer('level').notNull().default(3),
  sourceId: text('source_id'),
  sourceQuote: text('source_quote'),
  misconceptionsJson: text('misconceptions_json').notNull().default('[]'),
  grounded: integer('grounded', { mode: 'boolean' }).notNull().default(false),
  critical: integer('critical', { mode: 'boolean' }).notNull().default(false),
  visual: integer('visual', { mode: 'boolean' }).notNull().default(false),
  imageKey: text('image_key'),
  imageAlt: text('image_alt'),
  imageGenerationStartedAt: integer('image_generation_started_at'),
  genStatus: text('gen_status', { enum: ['pending', 'generating', 'ready', 'failed'] }).notNull().default('ready'),
  genError: text('gen_error'),
  // Claim time of the background item generation; a stale claim is picked up again.
  genStartedAt: integer('gen_started_at'),
})

export const conceptEdges = sqliteTable(
  'concept_edges',
  {
    topicId: text('topic_id').notNull(),
    fromId: text('from_id').notNull(), // prerequisite
    toId: text('to_id').notNull(), // depends on fromId
    confidence: real('confidence').notNull().default(1),
    why: text('why'),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] })],
)

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  conceptId: text('concept_id').notNull(),
  topicId: text('topic_id').notNull(),
  format: text('format', { enum: ['mcq', 'multi', 'cloze', 'short', 'image', 'order'] }).notNull(),
  payloadJson: text('payload_json').notNull(), // ItemPayload from src/lib/llm/schemas.ts
  generatedBy: text('generated_by'),
  difficultyPrior: integer('difficulty_prior').notNull().default(3),
  eloDifficulty: real('elo_difficulty'),
  checkJson: text('check_json'),
  sourceId: text('source_id'),
  sourceVersion: integer('source_version'), // sources.version the item was generated from.
  status: text('status', { enum: ['active', 'rejected', 'reported', 'retired'] }).notNull().default('active'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: integer('reviewed_at'),
  createdAt: integer('created_at').notNull(),
})

// Learner reports on a question; resolved_at is set when an admin handles the report.
export const itemFlags = sqliteTable('item_flags', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  userId: text('user_id').notNull(),
  reason: text('reason').notNull(),
  note: text('note'),
  attemptId: text('attempt_id'),
  sourceVersion: integer('source_version'),
  createdAt: integer('created_at').notNull(),
  resolvedAt: integer('resolved_at'),
}, (t) => [index('item_flags_item_idx').on(t.itemId)])

export const learnerTopic = sqliteTable(
  'learner_topic',
  {
    learnerId: text('learner_id').notNull(),
    topicId: text('topic_id').notNull(),
    level: integer('level').notNull().default(3),
    rating: real('rating').notNull().default(1500),
    lastSessionAt: integer('last_session_at'),
    streakCount: integer('streak_count').notNull().default(0),
    streakFreezeAvailable: integer('streak_freeze_available', { mode: 'boolean' }).notNull().default(true),
    xp: integer('xp').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.topicId] })],
)

export const learnerUnit = sqliteTable(
  'learner_unit',
  {
    learnerId: text('learner_id').notNull(),
    unitId: text('unit_id').notNull(),
    unlockedAt: integer('unlocked_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.unitId] })],
)

export const learnerConcept = sqliteTable(
  'learner_concept',
  {
    learnerId: text('learner_id').notNull(),
    conceptId: text('concept_id').notNull(),
    pKnown: real('p_known').notNull(),
    nAttempts: integer('n_attempts').notNull().default(0),
    masteredAt: integer('mastered_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.conceptId] })],
)

export const learnerItem = sqliteTable(
  'learner_item',
  {
    learnerId: text('learner_id').notNull(),
    itemId: text('item_id').notNull(),
    due: integer('due').notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    state: integer('state').notNull(),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    lastReview: integer('last_review'),
    scheduledDays: real('scheduled_days').notNull().default(0),
    lastWrongConfidentAt: integer('last_wrong_confident_at'),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.itemId] })],
)

export const attempts = sqliteTable('attempts', {
  id: text('id').primaryKey(),
  learnerId: text('learner_id').notNull(),
  sessionId: text('session_id'),
  itemId: text('item_id').notNull(),
  conceptId: text('concept_id').notNull(),
  at: integer('at').notNull(),
  answerJson: text('answer_json').notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  score: real('score').notNull(),
  confidence: text('confidence', { enum: ['sure', 'unsure', 'guess'] }).notNull(),
  responseMs: integer('response_ms').notNull(),
  gradeJson: text('grade_json'),
  rating: integer('rating').notNull(), // FSRS rating 1..4
  pKnownBefore: real('p_known_before').notNull(),
  pKnownAfter: real('p_known_after').notNull(),
  retrievabilityBefore: real('retrievability_before'),
}, (t) => [index('attempts_learner_at_idx').on(t.learnerId, t.at)])

export const placements = sqliteTable('placements', {
  id: text('id').primaryKey(),
  learnerId: text('learner_id').notNull(),
  topicId: text('topic_id').notNull(),
  logJson: text('log_json').notNull(),
  levelResult: integer('level_result'),
  createdAt: integer('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  learnerId: text('learner_id').notNull(),
  topicId: text('topic_id').notNull(),
  kind: text('kind', { enum: ['session', 'placement', 'mock', 'mini'] }).notNull(),
  itemIdsJson: text('item_ids_json').notNull().default('[]'),
  planJson: text('plan_json'), // coach trace
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  correctCount: integer('correct_count').notNull().default(0),
  xp: integer('xp').notNull().default(0),
}, (t) => [index('sessions_learner_idx').on(t.learnerId)])

export const badges = sqliteTable(
  'badges',
  {
    learnerId: text('learner_id').notNull(),
    badge: text('badge').notNull(),
    earnedAt: integer('earned_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.badge] })],
)

// Every model call is logged here; the trace panel and the cost counter read it.
export const modelCalls = sqliteTable('model_calls', {
  id: text('id').primaryKey(),
  learnerId: text('learner_id'),
  sessionId: text('session_id'),
  topicId: text('topic_id'),
  purpose: text('purpose').notNull(),
  model: text('model').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  costUsd: real('cost_usd'),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('model_calls_created_at_idx').on(t.createdAt)])

// Company training roles: the benchmark is the mastery threshold, onboarding_days the period it should be met in.
export const jobRoles = sqliteTable('job_roles', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  benchmark: real('benchmark').notNull().default(0.85),
  onboardingDays: integer('onboarding_days').notNull().default(30),
  status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  createdAt: integer('created_at').notNull(),
})

export const memberRoleAssignments = sqliteTable(
  'member_role_assignments',
  {
    userId: text('user_id').notNull(),
    orgId: text('org_id').notNull(),
    jobRoleId: text('job_role_id').notNull(),
    assignedAt: integer('assigned_at').notNull(),
    proficientAt: integer('proficient_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
)

export const consents = sqliteTable(
  'consents',
  {
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(), // e.g. 'disclosure-v1'
    acceptedAt: integer('accepted_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
)

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('push_subscriptions_user_idx').on(t.userId)])

export const pushPrefs = sqliteTable('push_prefs', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
  startMinute: integer('start_minute').notNull().default(540),
  endMinute: integer('end_minute').notNull().default(1020),
  timezone: text('timezone').notNull().default('UTC'),
  days: text('days_json', { mode: 'json' }).$type<number[]>(), // null follows the company's days
  updatedAt: integer('updated_at').notNull(),
})

export const pushLog = sqliteTable('push_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').notNull(), // Retained when a subscription expires.
  outcome: text('outcome', { enum: ['accepted', 'gone', 'failed'] }).notNull(),
  httpStatus: integer('http_status'),
  itemId: text('item_id'),
  sessionId: text('session_id'),
  openedAt: integer('opened_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('push_log_user_idx').on(t.userId)])

export const orgSettings = sqliteTable('org_settings', {
  orgId: text('org_id').primaryKey().references(() => organization.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  workingHours: text('working_hours_json', { mode: 'json' }).$type<WorkingHours>().notNull(),
  logoKey: text('logo_key'),
  accent: text('accent'),
})
