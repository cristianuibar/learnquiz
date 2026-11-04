import { useEffect, useState } from 'react'
import type { AuthCapabilities } from '@learnquiz/api/mobile-auth'
import { api } from '@/lib/api'
import { startFacebookSignIn } from '@/lib/auth'
import { AlertRow } from './ui/AlertRow'
import { Button } from './ui/Button'

export function FacebookSignIn({ disabled, invitationId }: { disabled?: boolean; invitationId?: string }) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void api<AuthCapabilities>('/auth/capabilities', { signal: controller.signal, timeoutMs: 5_000 }).then((config) => {
      if (!controller.signal.aborted) setEnabled(config.facebook === true)
    }).catch(() => {})
    return () => controller.abort()
  }, [])
  if (!enabled) return null
  return <>
    {error && <AlertRow>{error}</AlertRow>}
    <Button size="lg" variant="secondary" disabled={disabled} busy={busy} onPress={async () => {
      setBusy(true)
      setError(null)
      try { await startFacebookSignIn(invitationId) }
      catch { setError('Facebook sign-in could not start. Please try again.') }
      finally { setBusy(false) }
    }}>Continue with Facebook</Button>
  </>
}
