import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Opens the Loading screen, which starts the placement or session and then opens it.
export function StartButton({
  topicId,
  placement,
  unitId,
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
  unitId?: string
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'lg'
  label?: string
  disabled?: boolean
  describedBy?: string
  className?: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()

  function go() {
    void navigate({ to: '/play/loading', search: { topicId, start: placement ? 'placement' : 'session', unitId } })
  }

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
