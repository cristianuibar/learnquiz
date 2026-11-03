import { useId } from 'react'

export function LogoMark({ size, mono }: { size: number; mono?: boolean }) {
  const maskId = `lq-logo-${useId().replace(/:/g, '')}`
  const ringFill = mono ? 'var(--on-brand)' : 'var(--brand)'
  const dotFill = mono ? 'var(--on-brand)' : 'var(--accent)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" />
          <circle cx="18" cy="18" r="6" fill="black" />
        </mask>
      </defs>
      <path
        d="M11 1a10 10 0 1 0 0 20a10 10 0 1 0 0-20zm0 5a5 5 0 1 1 0 10a5 5 0 1 1 0-10z"
        fillRule="evenodd"
        fill={ringFill}
        mask={`url(#${maskId})`}
      />
      <circle cx="18" cy="18" r="4" fill={dotFill} />
    </svg>
  )
}

export function Logo({ href, markSize = 32 }: { href: string; markSize?: number }) {
  return (
    <a className="logo" href={href} aria-label="Learn Quiz home">
      <LogoMark size={markSize} />
      <span className="wordmark" aria-hidden="true">
        Learn Quiz
      </span>
    </a>
  )
}
