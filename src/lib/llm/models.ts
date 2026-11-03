export const PROVIDERS = {
  meta: { baseUrl: 'https://api.meta.ai/v1', keyBinding: 'LLM_API_KEY', jsonMode: 'json_schema' },
  baseten: { baseUrl: 'https://inference.baseten.co/v1', keyBinding: 'BASETEN_API_KEY', jsonMode: 'json_object' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference/v1', keyBinding: 'FIREWORKS_API_KEY', jsonMode: 'json_object' },
} as const

export type ModelJob = 'curriculum' | 'items' | 'self_check' | 'plan' | 'grade' | 'image' | 'voice' | 'placement_line'
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
