import { createElement as h } from 'react'
import { render, screen, within } from '@testing-library/react-native'
import type { Answer, ItemView } from '@learnquiz/api'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { MultiBody } from './multi'
import type { QuestionBodyProps } from './types'

jest.mock('./diagram-image', () => ({ DiagramImage: () => null }))

const item: ItemView = {
  id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'multi', blank: null, image: null, difficulty: 1,
  stem: 'Which inbound cartons need a lead’s sign-off before put-away?',
  options: [
    { id: 'hazmat', text: 'Hazmat-labeled cartons' },
    { id: 'seal', text: 'Cartons with a broken seal' },
    { id: 'heavy', text: 'Cartons over 23 kg' },
    { id: 'mixed', text: 'Mixed-SKU cartons' },
  ],
}

function body(answer: Answer, marks: QuestionBodyProps['marks']) {
  return render(h(ThemeProvider, {
    scheme: 'light',
    children: h(MultiBody, { item, answer, onAnswer: jest.fn(), marks, disabled: false }),
  }))
}

describe('multi-select after a reveal', () => {
  const marks = { hazmat: 'correct', seal: 'correct', heavy: 'rest', mixed: 'wrong' } as const

  test('tells a chosen correct option from a missed one by checked state and square', async () => {
    await body({ optionIds: ['hazmat', 'mixed'] }, marks)
    const chosen = screen.getByLabelText('Hazmat-labeled cartons, Correct')
    const missed = screen.getByLabelText('Cartons with a broken seal, Correct')
    expect(chosen).toBeChecked()
    expect(missed).not.toBeChecked()
    expect(within(chosen).getByTestId('check-box-checked')).toBeOnTheScreen()
    expect(within(missed).getByTestId('check-box-empty')).toBeOnTheScreen()
  })

  test('a chosen wrong option keeps its checked square with "Not quite", and an unchosen one stays empty', async () => {
    await body({ optionIds: ['hazmat', 'mixed'] }, marks)
    const wrong = screen.getByLabelText('Mixed-SKU cartons, Not quite')
    expect(wrong).toBeChecked()
    expect(within(wrong).getByTestId('check-box-checked')).toBeOnTheScreen()
    const rest = screen.getByLabelText('Cartons over 23 kg')
    expect(rest).not.toBeChecked()
    expect(within(rest).getByTestId('check-box-empty')).toBeOnTheScreen()
  })

  test('every option is locked while marked', async () => {
    await body({ optionIds: ['hazmat'] }, marks)
    for (const option of item.options) {
      expect(screen.getByRole('checkbox', { name: new RegExp(`^${option.text}`) })).toBeDisabled()
    }
  })
})

test('before a reveal each option is a checkbox showing its selection', async () => {
  await body({ optionIds: ['seal'] }, null)
  expect(screen.getByRole('checkbox', { name: 'Cartons with a broken seal' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Hazmat-labeled cartons' })).not.toBeChecked()
  expect(screen.getByText('Choose all that apply')).toBeOnTheScreen()
})
