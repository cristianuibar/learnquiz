// The only module allowed to import "cloudflare:workers". Server-side only.
import { env as workerEnv } from 'cloudflare:workers'
import type { JobModels } from '@/lib/llm/models'

export type AppEnv = Omit<Env, 'LLM_PROFILE' | 'LLM_BASE_URL' | 'LLM_MODEL' | 'LLM_API_KEY' | 'JOB_MODELS' | 'IMAGE_MODEL' | 'VOICE_ENABLED' | 'BETTER_AUTH_URL' | 'BETTER_AUTH_SECRET'> & {
  LLM_PROFILE: 'meta' | 'baseten' | 'fireworks' | 'ollama'
  LLM_BASE_URL: string
  LLM_MODEL: string
  LLM_API_KEY?: string
  BASETEN_API_KEY?: string
  FIREWORKS_API_KEY?: string
  JOB_MODELS?: JobModels | string
  IMAGE_MODEL: string
  VOICE_ENABLED: string
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET?: string
  FACEBOOK_APP_ID?: string
  FACEBOOK_APP_SECRET?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
}

// Call inside request handlers only: touching bindings at import time breaks the build.
export function getEnv(): AppEnv {
  return workerEnv as unknown as AppEnv
}
