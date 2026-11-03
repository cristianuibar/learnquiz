import type { ItemFormat } from '@learnquiz/api'
import { Button, type ButtonProps } from '../ui/Button'
import { RetryIcon } from '../ui/icons'

export type CheckButtonProps = Omit<ButtonProps, 'children' | 'variant' | 'size' | 'icon'> & {
  mode?: 'check' | 'retry'
  format?: ItemFormat
}

export function CheckButton({ mode = 'check', format, busy, ...props }: CheckButtonProps) {
  return (
    <Button
      {...props}
      variant="primary"
      size="lg"
      busy={busy}
      icon={mode === 'retry' ? RetryIcon : undefined}
      accessibilityHint={props.accessibilityHint ?? 'Choose an answer and how sure you are'}
    >
      {mode === 'retry' ? 'Try again' : busy && format === 'short' ? 'Checking' : 'Check'}
    </Button>
  )
}
