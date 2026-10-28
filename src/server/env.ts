// The only module allowed to import "cloudflare:workers". Server-side only.
import { env as workerEnv } from 'cloudflare:workers'

export type AppEnv = Omit<Env, 'LLM_PROFILE' | 'LLM_BASE_URL' | 'LLM_MODEL' | 'IMAGE_MODEL' | 'VOICE_ENABLED' | 'BETTER_AUTH_URL'> & {
  LLM_PROFILE: 'meta' | 'baseten' | 'ollama'
  LLM_BASE_URL: string
  LLM_MODEL: string
  LLM_API_KEY?: string
  IMAGE_MODEL: string
  VOICE_ENABLED: string
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET?: string
  FACEBOOK_APP_ID?: string
  FACEBOOK_APP_SECRET?: string
}

// Call inside request handlers only: touching bindings at import time breaks the build.
export function getEnv(): AppEnv {
  return workerEnv as unknown as AppEnv
}
