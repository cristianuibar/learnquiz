import { sql } from 'drizzle-orm'
import { concepts, sources } from '@/db/schema'

// A concept is live while its document is: one retired source takes its concepts out of generation, claims,
// the learner frontier and placement. Use it inside the statement that claims or selects, never as an earlier read.
// Kept apart from server helpers so client bundles that keep a query builder do not pull in server-only modules.
export const liveConcept = () => sql`not exists (select 1 from ${sources} where ${sources.id} = ${concepts.sourceId} and ${sources.retiredAt} is not null)`
