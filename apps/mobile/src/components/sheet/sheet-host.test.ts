import { createElement as h } from 'react'
import { Pressable, Text, View } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { SheetHost } from './sheet-host'

function wrapperOf(node: ReturnType<typeof screen.getByText> | null): ReturnType<typeof screen.getByText> | null {
  let current = node
  while (current && current.props.importantForAccessibility === undefined) current = current.parent
  return current
}

const screenContent = () => h(Pressable, { accessibilityRole: 'button' }, h(Text, null, 'Home'))
const overlay = h(View, { testID: 'overlay' }, h(Text, null, 'Result'))

test('the screen stays reachable by TalkBack while no sheet is open', async () => {
  await render(h(SheetHost, { sheet: null, children: screenContent() }))
  expect(screen.getByRole('button', { name: 'Home' })).toBeOnTheScreen()
  expect(screen.queryByTestId('overlay')).toBeNull()
  expect(wrapperOf(screen.getByRole('button', { name: 'Home' }))).toHaveProp('importantForAccessibility', 'auto')
})

test('opening a sheet hides the screen from TalkBack and closing it restores it', async () => {
  const view = await render(h(SheetHost, { sheet: null, children: screenContent() }))
  await view.rerender(h(SheetHost, { sheet: overlay, children: screenContent() }))
  expect(screen.getByTestId('overlay')).toBeOnTheScreen()
  expect(screen.queryByRole('button', { name: 'Home' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Home', includeHiddenElements: true })).toBeOnTheScreen()
  await view.rerender(h(SheetHost, { sheet: null, children: screenContent() }))
  expect(screen.queryByTestId('overlay')).toBeNull()
  expect(screen.getByRole('button', { name: 'Home' })).toBeOnTheScreen()
})

test('the overlay is a sibling of the hidden screen and fills the host', async () => {
  await render(h(SheetHost, { sheet: overlay, children: screenContent() }))
  const hidden = wrapperOf(screen.getByRole('button', { name: 'Home', includeHiddenElements: true }))
  expect(hidden).toHaveProp('importantForAccessibility', 'no-hide-descendants')
  expect(hidden).toHaveProp('accessibilityElementsHidden', true)
  const overlayWrap = screen.getByTestId('overlay').parent
  expect(overlayWrap).toHaveStyle({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 })
  expect(overlayWrap?.parent).toBe(hidden?.parent)
  expect(hidden?.parent).toHaveStyle({ flex: 1 })
})
