import { createElement as h } from 'react'
import { StyleSheet } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ItemView } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { OrderBody } from './order'

// The item has no image; the diagram loader pulls in native modules.
jest.mock('./diagram-image', () => ({ DiagramImage: () => null }))

const item: ItemView = {
  id: 'i', conceptId: 'c', conceptName: 'Returns', format: 'order', blank: null, image: null, difficulty: 1,
  stem: 'Put the returns steps in order.',
  options: [
    { id: 'inspect', text: 'Inspect the item' },
    { id: 'clean', text: 'Clean it' },
    { id: 'test', text: 'Test it' },
  ],
}

function clearBox(order: string[]) {
  const onAnswer = jest.fn()
  return render(h(ThemeProvider, {
    scheme: 'light',
    children: h(OrderBody, { item, answer: { order }, onAnswer, marks: null, disabled: false }),
  })).then(() => {
    const clear = screen.getByRole('button', { name: 'Clear', includeHiddenElements: true })
    const { borderWidth, paddingVertical, paddingHorizontal, minHeight, minWidth } = StyleSheet.flatten(clear.props.style)
    return { clear, onAnswer, box: { borderWidth, paddingVertical, paddingHorizontal, minHeight, minWidth } }
  })
}

test('hidden and shown Clear have the same box, so the caption row keeps its height', async () => {
  const hidden = await clearBox([])
  const shown = await clearBox(['inspect'])
  expect(hidden.box).toEqual(shown.box)
  expect(hidden.box.borderWidth).toBe(0)
})

test('hidden Clear stays out of reach and shown Clear clears the steps', async () => {
  const hidden = await clearBox([])
  expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  expect(hidden.clear).toBeDisabled()
  const shown = await clearBox(['inspect'])
  await fireEvent.press(screen.getByRole('button', { name: 'Clear' }))
  expect(shown.onAnswer).toHaveBeenCalledWith({ order: [] })
})
