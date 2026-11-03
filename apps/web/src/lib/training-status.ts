import type { topics } from '@/db/schema'

// Topic status in the words partners and staff both see for a role's training.
export const TRAINING_STATUS: Record<typeof topics.$inferSelect.status, string> = {
  draft: 'No documents yet',
  generating: 'Preparing training',
  ready: 'Ready',
  failed: 'Training failed',
}
