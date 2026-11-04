import { useSyncExternalStore } from 'react'
import { useRouter } from '@tanstack/react-router'
import { WifiOff } from 'lucide-react'
import { offlineBody, offlineTitle } from '@learnquiz/api/system-copy'
import { Button } from '@/components/ui/button'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}

export function OfflineNotice({ id }: { id: string }) {
  const router = useRouter()

  async function retry() {
    // Reloading while offline would fail the loader and replace Today with the route error.
    if (navigator.onLine) await router.invalidate()
    window.dispatchEvent(new Event(navigator.onLine ? 'online' : 'offline'))
  }

  return (
    <div className="flex gap-3 rounded-md bg-surface-sunken p-4">
      <WifiOff className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div id={id} role="status" className="flex flex-col gap-1">
          <p className="text-label text-ink">{offlineTitle}</p>
          <p className="text-body text-ink-muted">{offlineBody}</p>
        </div>
        <Button variant="secondary" className="w-full" onClick={retry}>
          Try again
        </Button>
      </div>
    </div>
  )
}
