import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { InlineError, errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Working } from '@/components/working'
import { startPlacement, startSession } from '@/server/play'

// Starts a placement or a session, then opens it. Placement writes questions (~45 s); a session usually
// starts in seconds, since the next concepts' questions are written ahead during the previous session.
export function StartButton({
  topicId,
  placement,
  variant,
  size,
  label,
  disabled,
  describedBy,
  className,
  children,
}: {
  topicId: string
  placement?: boolean
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'lg'
  label?: string
  disabled?: boolean
  describedBy?: string
  className?: string
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

  if (working) {
    return (
      <Working
        label={placement ? 'Writing your first questions' : 'Picking your questions'}
        seconds={placement ? 45 : 15}
      />
    )
  }
  if (error) return <InlineError message={error} onRetry={go} />
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('w-full px-6 sm:w-auto', className)}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={go}
    >
      {children}
    </Button>
  )
}
