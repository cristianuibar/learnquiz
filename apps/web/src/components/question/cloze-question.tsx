import { useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import type { QuestionProps } from '@/components/question/question-screen'

const BLANK = '____'

export function ClozeQuestion({ item, choice, onChoice }: QuestionProps) {
  const numeric = Boolean(item.blank?.numeric)
  const input = useRef<HTMLInputElement>(null)
  const focused = useRef(false)

  // The one focus exception to the heading rule: the field takes focus once it is enabled
  // (the fieldset is disabled while the route loads, so this runs on every render until then).
  useEffect(() => {
    const el = input.current
    if (focused.current || !el || el.matches(':disabled')) return
    el.focus()
    focused.current = document.activeElement === el
  })

  const at = item.stem.indexOf(BLANK)
  const before = at < 0 ? item.stem : item.stem.slice(0, at)
  const after = at < 0 ? '' : item.stem.slice(at + BLANK.length)

  return (
    // The sentence stands in for the stem heading on screen; the h1 stays for screen readers.
    <div data-compact-dock className="[form:has(&)_h1]:sr-only">
      <label htmlFor="answer" className="block py-1 text-title-2 leading-10 text-ink">
        {before}
        <Input
          ref={input}
          id="answer"
          value={choice}
          autoComplete="off"
          enterKeyHint="done"
          className="mx-1 -mt-1 inline-block h-9 min-h-0 w-22 border-brand px-2 py-1 text-center align-middle text-title-2 leading-6"
          inputMode={numeric ? 'numeric' : undefined}
          pattern={numeric ? '[0-9]*' : undefined}
          aria-label={numeric ? 'Missing number' : 'Missing word'}
          maxLength={numeric ? 3 : 40}
          onChange={(e) => onChoice(numeric ? e.target.value.replace(/\D/g, '').slice(0, 3) : e.target.value.slice(0, 40))}
        />
        {after}
      </label>
    </div>
  )
}
