import type { ReactNode } from 'react'

export function PhoneFrame({
  label,
  os,
  className,
  screenClassName,
  children,
}: {
  label?: string
  os?: boolean
  className?: string
  screenClassName?: string
  children: ReactNode
}) {
  const outerClassName = ['phone', className].filter(Boolean).join(' ')
  const screenClass = ['phone-screen', os ? 'os' : '', screenClassName].filter(Boolean).join(' ')
  if (label) {
    return (
      <div className={outerClassName} role="img" aria-label={label}>
        <div className={screenClass} aria-hidden="true">
          {children}
        </div>
      </div>
    )
  }
  return (
    <div className={outerClassName}>
      <div className={screenClass}>{children}</div>
    </div>
  )
}
