import { revealCopy } from '@learnquiz/api/reveal'
import { TextField } from '../ui/TextField'

export const REFLECTION_MAX = 300

export type ReflectionFieldProps = { value: string; onChangeText: (text: string) => void }

export function ReflectionField({ value, onChangeText }: ReflectionFieldProps) {
  return (
    <TextField
      label={revealCopy.reflection}
      helper={revealCopy.optional}
      value={value}
      onChangeText={onChangeText}
      maxLength={REFLECTION_MAX}
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      autoCapitalize="sentences"
      autoComplete="off"
    />
  )
}
