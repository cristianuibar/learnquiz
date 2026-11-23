import type { topics } from '@/db/schema'

// Topic status in the words partners and staff both see for a role's training.
export const TRAINING_STATUS: Record<typeof topics.$inferSelect.status, string> = {
  draft: 'No documents yet',
  generating: 'Preparing training',
  ready: 'Ready',
  failed: 'Training failed',
}

// A role can have documents before a curriculum exists, or lose its last readable document after a build.
// A built curriculum whose question generation failed for some concepts is only partly ready, or failed when none are ready.
export function roleTrainingStatus(role: {
  topicStatus: typeof topics.$inferSelect.status
  documentCount: number
  failedDocuments: number
  conceptsReady: number
  failedConcepts: number
  preparing: boolean
}) {
  if (role.topicStatus === 'failed' || (role.failedDocuments > 0 && role.documentCount === role.failedDocuments)) return 'Training failed'
  if (role.topicStatus === 'generating' || role.preparing) return 'Preparing training'
  if (role.topicStatus === 'ready' && role.failedConcepts > 0) return role.conceptsReady > 0 ? 'Partly ready' : 'Training failed'
  if (role.topicStatus === 'ready') return 'Ready'
  return role.documentCount === 0 ? 'No documents yet' : 'Documents added'
}
