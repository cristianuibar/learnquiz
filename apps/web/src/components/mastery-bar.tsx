import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// `from` animates the bar from the old mastery to the new one on mount.
export function MasteryBar({
  value,
  from,
  label,
  className,
}: {
  value: number
  from?: number
  label: string
  className?: string
}) {
  const [shown, setShown] = useState(from ?? value)
  useEffect(() => setShown(value), [value])
  return (
    <Progress value={shown * 100} aria-label={label} className={cn('h-2 *:motion-reduce:transition-none', className)} />
  )
}
