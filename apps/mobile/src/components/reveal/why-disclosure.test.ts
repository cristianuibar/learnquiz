import { createElement as h } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'
import { WhyDisclosure } from './why-disclosure'

function disclosure(openByDefault = false) {
  return h(ThemeProvider, {
    children: h(WhyDisclosure, { openByDefault, children: h(Text, null, 'Record the damage before moving anything.') }),
  })
}

test('Why has a 48 dp touch target and toggles its content and expanded accessibility state', async () => {
  await render(disclosure())
  const why = screen.getByRole('button', { name: 'Why', expanded: false })
  expect(why).toHaveStyle({ minHeight: 48, minWidth: 48 })
  expect(screen.queryByText('Record the damage before moving anything.')).toBeNull()

  await fireEvent.press(why)
  expect(screen.getByRole('button', { name: 'Why', expanded: true })).toBeOnTheScreen()
  expect(screen.getByText('Record the damage before moving anything.')).toBeOnTheScreen()

  await fireEvent.press(screen.getByRole('button', { name: 'Why' }))
  expect(screen.getByRole('button', { name: 'Why', expanded: false })).toBeOnTheScreen()
  expect(screen.queryByText('Record the damage before moving anything.')).toBeNull()
})

test('openByDefault reveals the content and still allows it to collapse', async () => {
  await render(disclosure(true))
  expect(screen.getByText('Record the damage before moving anything.')).toBeOnTheScreen()
  await fireEvent.press(screen.getByRole('button', { name: 'Why', expanded: true }))
  expect(screen.getByRole('button', { name: 'Why', expanded: false })).toBeOnTheScreen()
  expect(screen.queryByText('Record the damage before moving anything.')).toBeNull()
})
