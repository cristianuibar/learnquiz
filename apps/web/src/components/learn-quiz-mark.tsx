import { useId } from 'react'

export function LearnQuizMark({ className }: { className?: string }) {
  const maskId = useId()
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="white" />
        <circle cx="48" cy="48" r="13" fill="black" />
      </mask>
      <circle cx="32" cy="32" r="19" strokeWidth="14" fill="none" className="stroke-brand" mask={`url(#${maskId})`} />
      <circle cx="48" cy="48" r="9" className="fill-accent" />
    </svg>
  )
}
