import { createServerFn } from '@tanstack/react-start'
import { hasModel } from '@/lib/llm/client'

// The start page shows an unavailable state instead of a form that can only fail.
export const canCreateTopic = createServerFn({ method: 'GET' }).handler(async (): Promise<boolean> => hasModel('curriculum'))
