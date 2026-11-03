export const MULTI_CAPTION = 'Choose all that apply'

export type MultiMark = 'correct' | 'wrong' | 'rest'

export type MultiRow = {
  id: string
  text: string
  selected: boolean
  mark: MultiMark | null
  disabled: boolean
}

export function toggleOption(options: { id: string }[], selected: readonly string[] | undefined, id: string): string[] {
  if (!options.some((option) => option.id === id)) {
    return options.filter((option) => selected?.includes(option.id)).map((option) => option.id)
  }
  const next = new Set(selected ?? [])
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return options.filter((option) => next.has(option.id)).map((option) => option.id)
}

export function multiRows(
  options: { id: string; text: string }[],
  selected: readonly string[] | undefined,
  marks: Record<string, MultiMark> | null,
  disabled: boolean,
): MultiRow[] {
  return options.map((option) => ({
    id: option.id,
    text: option.text,
    selected: selected?.includes(option.id) ?? false,
    mark: marks?.[option.id] ?? null,
    disabled: disabled || marks !== null,
  }))
}
