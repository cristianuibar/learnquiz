import { createElement as h } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ItemView } from '@learnquiz/api'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { MultipleChoiceBody } from './mcq'
import type { QuestionBodyProps } from './types'

jest.mock('./diagram-image', () => ({ DiagramImage: () => null }))

const item: ItemView = {
  id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'mcq', blank: null, image: null, difficulty: 1,
  stem: 'What should you do first?',
  options: [
    { id: 'record', text: 'Record the damage' },
    { id: 'move', text: 'Move the pallet' },
    { id: 'wrap', text: 'Re-wrap it' },
    { id: 'ignore', text: 'Ignore the damage' },
  ],
}

describe.each(['light', 'dark'] as const)('%s multiple choice', (scheme) => {
  test.each([true, false])('sparse reveal marks mute every uninvolved option (correct: %s)', async (correct) => {
    const marks: NonNullable<QuestionBodyProps['marks']> = correct ? { record: 'correct' } : { record: 'correct', move: 'wrong' }
    const onAnswer = jest.fn()
    await render(h(ThemeProvider, { scheme, children: h(MultipleChoiceBody, {
      item, answer: { optionId: correct ? 'record' : 'move' }, onAnswer, marks, disabled: false,
    }) }))
    expect(screen.getByRole('radio', { name: 'Record the damage, Correct' })).toHaveStyle({ borderColor: themes[scheme].feedbackCorrect })
    if (!correct) expect(screen.getByRole('radio', { name: 'Move the pallet, Not quite' })).toHaveStyle({ borderColor: themes[scheme].feedbackWrong })
    for (const option of item.options.filter((option) => !(option.id in marks))) {
      const row = screen.getByRole('radio', { name: option.text })
      expect(row).toHaveStyle({ borderColor: themes[scheme].border })
      expect(screen.getByText(option.text)).toHaveStyle({ color: themes[scheme].inkMuted })
      expect(row).toBeDisabled()
      await fireEvent.press(row)
    }
    expect(onAnswer).not.toHaveBeenCalled()
  })

  test('unanswered options keep their ordinary ink and outline and can be selected', async () => {
    const onAnswer = jest.fn()
    await render(h(ThemeProvider, { scheme, children: h(MultipleChoiceBody, {
      item, answer: {}, onAnswer, marks: null, disabled: false,
    }) }))
    for (const option of item.options) {
      expect(screen.getByRole('radio', { name: option.text })).toHaveStyle({ borderColor: themes[scheme].borderStrong })
      expect(screen.getByText(option.text)).toHaveStyle({ color: themes[scheme].ink })
    }
    await fireEvent.press(screen.getByRole('radio', { name: 'Move the pallet' }))
    expect(onAnswer).toHaveBeenCalledWith({ optionId: 'move' })
  })
})
