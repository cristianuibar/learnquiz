import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { InlineError, errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Working } from '@/components/working'
import { startPlacement, startSession } from '@/server/play'

// Starts a placement or a session (up to 40 s of question writing), then opens it.
export function StartButton({
  topicId,
  placement,
  variant,
  children,
}: {
  topicId: string
  placement?: boolean
  variant?: 'default' | 'outline'
  children: React.ReactNode
}) {
  const router = useRouter()
  const start = useServerFn(placement ? startPlacement : startSession)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function go() {
    setWorking(true)
    setError('')
    try {
      const { sessionId } = await start({ data: { topicId } })
      await router.navigate({ to: '/play/$sessionId', params: { sessionId } })
    } catch (err) {
      setError(errorMessage(err))
      setWorking(false)
    }
  }

  if (working) return <Working label={placement ? 'Writing your first questions' : 'Picking your questions'} />
  if (error) return <InlineError message={error} onRetry={go} />
  return (
    <Button variant={variant} className="h-12 w-full px-6 sm:w-auto" onClick={go}>
      {children}
    </Button>
  )
}
