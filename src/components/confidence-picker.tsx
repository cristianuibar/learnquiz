import { ChoiceGroup } from '@/components/choice-group'
import type { Confidence } from '@/lib/learning/types'

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
      options={OPTIONS}
      value={value}
      onChange={(id) => onChange(id as Confidence)}
      className="grid grid-cols-3 gap-2"
      itemClassName="justify-center"
    />
  )
}
