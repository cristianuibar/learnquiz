export type IconName =
  | 'check'
  | 'close'
  | 'doc'
  | 'critical'
  | 'ban'
  | 'play'
  | 'volume'
  | 'replay'
  | 'eye'
  | 'envelope'
  | 'timer'
  | 'target'
  | 'chevron-right'
  | 'chevron-down'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'menu'
  | 'home'
  | 'path'
  | 'profile'

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {name === 'check' ? <path d="M4.5 12.5l5 5L19.5 7" /> : null}
      {name === 'close' ? <path d="M6 6l12 12M18 6L6 18" /> : null}
      {name === 'doc' ? (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
      ) : null}
      {name === 'critical' ? (
        <>
          <path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z" />
          <circle cx="12" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {name === 'ban' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6l12.8 12.8" />
        </>
      ) : null}
      {name === 'play' ? <path d="M8 5.5v13l10.5-6.5z" /> : null}
      {name === 'volume' ? (
        <>
          <path d="M4 9v6h4l5 4V5L8 9z" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        </>
      ) : null}
      {name === 'replay' ? <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /> : null}
      {name === 'eye' ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : null}
      {name === 'envelope' ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </>
      ) : null}
      {name === 'timer' ? (
        <>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M10 2h4" />
        </>
      ) : null}
      {name === 'target' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {name === 'chevron-right' ? <path d="M9 6l6 6-6 6" /> : null}
      {name === 'chevron-down' ? <path d="M6 9l6 6 6-6" /> : null}
      {name === 'arrow-right' ? <path d="M5 12h14M13 6l6 6-6 6" /> : null}
      {name === 'arrow-up-right' ? <path d="M7 17L17 7M8 7h9v9" /> : null}
      {name === 'menu' ? <path d="M4 7h16M4 12h16M4 17h16" /> : null}
      {name === 'home' ? (
        <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
      ) : null}
      {name === 'path' ? (
        <>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M8 6h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" />
        </>
      ) : null}
      {name === 'profile' ? (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      ) : null}
    </svg>
  )
}
