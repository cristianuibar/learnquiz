export const ORDER_CAPTION = 'Tap the steps in order'

export type OrderStep = { id: string; text: string }
export type OrderRow = { id: string; text: string; position: number | null; label: string; disabled: boolean }

// Tap an unplaced step to give it the next number; tap a placed step to remove it (later ones move up).
export function toggleStep(order: readonly string[] | undefined, id: string): string[] {
  const current = order ?? []
  return current.includes(id) ? current.filter((step) => step !== id) : [...current, id]
}

export function positionOf(order: readonly string[] | undefined, id: string): number | null {
  const index = (order ?? []).indexOf(id)
  return index < 0 ? null : index + 1
}

// Clear empties every placement: the answer becomes { order: [] }.
export function clearSteps(): string[] {
  return []
}

export function stepLabel(text: string, position: number | null): string {
  return position == null ? `${text}, not placed yet` : `${text}, position ${position}`
}

export function stepAnnouncement(text: string, position: number | null, total: number): string {
  return position == null ? `${text}, not placed` : `${text}, ${position} of ${total}`
}

export function orderRows(
  options: readonly OrderStep[],
  order: readonly string[] | undefined,
  marks: Record<string, unknown> | null,
  disabled: boolean,
): OrderRow[] {
  return options.map((option) => {
    const position = positionOf(order, option.id)
    return { id: option.id, text: option.text, position, label: stepLabel(option.text, position), disabled: disabled || marks !== null }
  })
}
