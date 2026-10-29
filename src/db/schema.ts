import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// learner_id everywhere is the Better Auth user id (guest or Facebook). ids are crypto.randomUUID().
// Times are epoch milliseconds. JSON lives in *_json text columns.

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  learnerId: text('learner_id').notNull(),
  title: text('title').notNull(),
  goal: text('goal'),
  status: text('status', { enum: ['generating', 'ready', 'failed'] }).notNull().default('generating'),
  createdAt: integer('created_at').notNull(),
})

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
  kind: text('kind', { enum: ['text', 'url', 'pdf', 'image'] }).notNull(),
  title: text('title').notNull(),
  bodyText: text('body_text').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const units = sqliteTable('units', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
  order: integer('order').notNull(),
  name: text('name').notNull(),
  summary: text('summary').notNull().default(''),
  unlockedAt: integer('unlocked_at'),
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
  visual: integer('visual', { mode: 'boolean' }).notNull().default(false),
  imageKey: text('image_key'),
  imageAlt: text('image_alt'),
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
  format: text('format', { enum: ['mcq', 'cloze', 'short', 'image', 'order'] }).notNull(),
  payloadJson: text('payload_json').notNull(), // ItemPayload from src/lib/llm/schemas.ts
  difficultyPrior: integer('difficulty_prior').notNull().default(3),
  eloDifficulty: real('elo_difficulty'),
  checkJson: text('check_json'),
  status: text('status', { enum: ['active', 'rejected', 'reported'] }).notNull().default('active'),
  createdAt: integer('created_at').notNull(),
})

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
})

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
})

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
  purpose: text('purpose').notNull(),
  model: text('model').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
})

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
