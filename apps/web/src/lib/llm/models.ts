export const PROVIDERS = {
  meta: { baseUrl: 'https://api.meta.ai/v1', keyBinding: 'LLM_API_KEY', jsonMode: 'json_schema' },
  baseten: { baseUrl: 'https://inference.baseten.co/v1', keyBinding: 'BASETEN_API_KEY', jsonMode: 'json_object' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', keyBinding: 'FIREWORKS_API_KEY', jsonMode: 'json_object' },
} as const

export type ModelJob = 'curriculum' | 'items' | 'self_check' | 'plan' | 'grade' | 'procedure' | 'image' | 'voice' | 'placement_line'
export type JobModels = Partial<Record<ModelJob, { provider: keyof typeof PROVIDERS; model: string }>>

// Exact Meta model IDs; Fireworks may prefix these with accounts/fireworks/models/.
export const META_MODELS = new Set([
  'muse-spark-1.3',
  'muse-wonder-1.0',
  'muse-image-1.0',
  'muse-voice-transcribe-1.0',
  'muse-spark-open',
  'muse-glimmer',
])

// Display names live in @learnquiz/api so the mobile app names models the same way.
export { modelDisplayName } from '@learnquiz/api/models'

const JOB_LABELS: Record<ModelJob, string> & Record<string, string> = {
  curriculum: 'Curriculum',
  items: 'Questions',
  self_check: 'Question check',
  plan: 'Session plan',
  grade: 'Grading',
  procedure: 'Procedure diagrams',
  image: 'Diagrams',
  voice: 'Voice answers',
  placement_line: 'Placement',
  // Stored purpose of the diagram generator (generateImage in client.ts), read by model-trace.ts.
  diagram: 'Diagrams',
}

// Display label for a stored model_calls.purpose; an unknown purpose is shown unchanged.
export function jobLabel(purpose: string): string {
  return Object.hasOwn(JOB_LABELS, purpose) ? JOB_LABELS[purpose] : purpose
}
