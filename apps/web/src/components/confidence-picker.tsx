import { ChoiceGroup } from '@/components/choice-group'
import type { Confidence } from '@learnquiz/api'

const OPTIONS = [
  { id: 'sure', text: 'Sure' },
  { id: 'unsure', text: 'Unsure' },
  { id: 'guess', text: 'Guessing' },
]

export function ConfidencePicker({
  value,
  onChange,
}: {
  value: Confidence | null
  onChange: (c: Confidence) => void
}) {
  return (
    <ChoiceGroup
      name="confidence"
      legend="How sure are you?"
      legendClassName="mb-2 text-caption font-medium text-ink-muted"
      options={OPTIONS}
      value={value}
      onChange={(id) => onChange(id as Confidence)}
      indicator="check"
      className="grid grid-cols-3 gap-2"
      itemClassName="px-2"
    />
  )
}
