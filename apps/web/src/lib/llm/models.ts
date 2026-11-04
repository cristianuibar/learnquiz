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

const FIREWORKS_PREFIX = 'accounts/fireworks/models/'

const MODEL_NAMES: Record<string, string> = {
  'muse-spark-1.3': 'Muse Spark',
  'muse-spark-open': 'Muse Spark Open',
  'muse-glimmer': 'Muse Glimmer',
  'muse-wonder-1.0': 'Muse Wonder',
  'muse-image-1.0': 'Muse Image',
  'muse-voice-transcribe-1.0': 'Muse Voice Transcribe',
}

// Display name for a recorded model id; an unknown id is shown as recorded, never guessed.
export function modelDisplayName(id: string): string {
  const bare = id.startsWith(FIREWORKS_PREFIX) ? id.slice(FIREWORKS_PREFIX.length) : id
  return MODEL_NAMES[bare] ?? id
}

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
