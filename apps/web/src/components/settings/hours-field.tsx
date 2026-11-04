export type TimeOption = { value: number; label: string }

function Select({ id, label, value, options, disabled, onChange }: {
  id: string; label: string; value: number; options: TimeOption[]; disabled?: boolean; onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-caption text-ink-muted">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-12 rounded-md border-2 border-border-strong bg-surface-card px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

export function HoursField({ start, end, startOptions, endOptions, caption, disabled, onStart, onEnd }: {
  start: number; end: number; startOptions: TimeOption[]; endOptions: TimeOption[]; caption?: string | null
  disabled?: boolean; onStart: (minute: number) => void; onEnd: (minute: number) => void
}) {
  return (
    <div role="group" aria-labelledby="settings-hours" className="flex flex-col gap-2">
      <p id="settings-hours" className="text-label text-ink">Working hours</p>
      <div className="flex gap-4">
        <Select id="settings-from" label="From" value={start} options={startOptions} disabled={disabled} onChange={onStart} />
        <Select id="settings-to" label="To" value={end} options={endOptions} disabled={disabled} onChange={onEnd} />
      </div>
      {caption && <p className="text-caption text-ink-muted">{caption}</p>}
    </div>
  )
}
