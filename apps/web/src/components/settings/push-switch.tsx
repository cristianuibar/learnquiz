import { cn } from '@/lib/utils'

export function PushSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-12 items-center justify-between gap-4">
        <span id="push-switch-label" className="text-body text-ink">Send me questions</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby="push-switch-label"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className="flex min-h-12 min-w-12 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={cn('relative block h-8 w-[52px] rounded-full border-2', checked ? 'border-brand bg-brand' : 'border-border-strong bg-surface-sunken')}>
            <span
              className={cn(
                'absolute top-0.5 left-0.5 block size-6 rounded-full bg-surface-card motion-safe:transition-transform motion-safe:duration-fast',
                checked && 'translate-x-5',
              )}
            />
          </span>
        </button>
      </div>
      {!checked && <p role="status" className="text-caption text-ink-muted">Paused. Turn back on any time.</p>}
    </div>
  )
}
