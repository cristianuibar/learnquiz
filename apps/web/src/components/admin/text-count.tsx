import { CircleAlert } from 'lucide-react'
import { useState } from 'react'

const fmt = (n: number) => n.toLocaleString('en-US')

export function TextCount({ value, max, id }: { value: string; max: number; id: string }) {
  const count = value.length
  const level = count >= max ? 2 : count >= max * 0.9 ? 1 : 0
  const over = count > max
  const [prev, setPrev] = useState(level)
  const [message, setMessage] = useState('')

  if (prev !== level) {
    setPrev(level)
    setMessage(
      level < prev
        ? ''
        : level === 2
          ? `Character limit reached: ${fmt(max)}.`
          : `90% of the ${fmt(max)} character limit used.`,
    )
  }

  return (
    <>
      {over ? (
        <p id={id} role="alert" className="flex items-start gap-2 text-label tabular-nums text-ink">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {fmt(count)} / {fmt(max)} · {fmt(count - max)} over the limit. Shorten the text.
          </span>
        </p>
      ) : (
        <p id={id} className="text-caption tabular-nums text-ink-muted">
          {fmt(count)} / {fmt(max)}
        </p>
      )}
      <span role="status" className="sr-only">
        {message}
      </span>
    </>
  )
}
