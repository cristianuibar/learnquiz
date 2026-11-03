import { createElement as h } from 'react'
import { StyleSheet } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { themes } from '@learnquiz/tokens/native'
import type { Answer, ItemView, Reveal } from '@learnquiz/api'
import { revealModel } from '@learnquiz/api/reveal'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { WrongBody } from './wrong-body'

const base: Reveal = {
  diagramConceptId: null, attemptId: 'attempt', state: 'C', correct: false, xp: 0, critical: false, correctOptionIds: ['record'], detail: null,
  score: 0, feedback: null, missingPoints: [], correctAnswer: 'Photograph the damage', chosenFeedback: 'Quarantine is step two.', explanation: 'The receipt is your only proof.',
  sourceQuote: 'Photograph the damage before moving anything.', sourceTitle: 'Receiving SOP', sourceVersion: 3, mixUps: [], returnsThisSession: true,
  pKnownBefore: 0.4, pKnownAfter: 0.3,
}
const mcq: ItemView = {
  id: 'i', conceptId: 'c', conceptName: 'Receiving', format: 'mcq', stem: 'What first?', blank: null, image: null, difficulty: 1,
  options: [{ id: 'record', text: 'Photograph the damage' }, { id: 'move', text: 'Move it to Quarantine bay Q1' }],
}

function body(reveal: Partial<Reveal> = {}, { item = mcq, answer = { optionId: 'move' } as Answer, reflection = '', onReflection = jest.fn(), scheme = 'light' as 'light' | 'dark' } = {}) {
  const full = { ...base, ...reveal }
  return render(h(ThemeProvider, {
    scheme,
    children: h(WrongBody, { model: revealModel(full, { hasCompany: true }), reveal: full, item, answer, reflection, onReflection }),
  }))
}

describe('not quite', () => {
  test('pairs the answer with the chosen option and its feedback, then the quote and the return line', async () => {
    await body()
    expect(screen.getByLabelText('The answer: Photograph the damage')).toBeOnTheScreen()
    expect(screen.getByLabelText('You chose: Move it to Quarantine bay Q1. Quarantine is step two.')).toBeOnTheScreen()
    expect(screen.getByLabelText(/^Quote: Photograph the damage before moving anything\./)).toBeOnTheScreen()
    expect(screen.getByLabelText('This comes back later this session.')).toBeOnTheScreen()
    expect(screen.queryByText('Why it felt right')).toBeNull()
    expect(screen.queryByText('What actually matters')).toBeNull()
    expect(screen.queryByLabelText('In one line: why does this matter?')).toBeNull()
    expect(screen.queryByLabelText(/^Critical step/)).toBeNull()
  })

  test('a cloze answer reads "You wrote" with the explanation as the why line', async () => {
    await body({ chosenFeedback: null }, { item: { ...mcq, format: 'cloze', options: [] }, answer: { text: ' Q1 ' } })
    expect(screen.getByLabelText('You wrote: Q1. The receipt is your only proof.')).toBeOnTheScreen()
  })

  test('no return line when the item does not come back this session', async () => {
    await body({ returnsThisSession: false })
    expect(screen.queryByText('This comes back later this session.')).toBeNull()
  })

  test('a short answer shows the learner first, the feedback and the missing points', async () => {
    await body(
      { chosenFeedback: null, feedback: 'You named the photo but not the receipt.', missingPoints: ['Write it on the receipt', ' '] },
      { item: { ...mcq, format: 'short', options: [] }, answer: { text: 'Take a photo' } },
    )
    const labels = screen.getAllByLabelText(/^(Your answer|The answer):/).map((node) => node.props.accessibilityLabel)
    expect(labels[0]).toMatch(/^Your answer: Take a photo/)
    expect(labels[1]).toMatch(/^The answer: Photograph the damage/)
    expect(screen.getByText('You named the photo but not the receipt.')).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Missing points' })).toBeOnTheScreen()
    expect(screen.getByText('• Write it on the receipt')).toBeOnTheScreen()
    expect(screen.getAllByText(/^• /)).toHaveLength(1)
  })
})

describe('sure and wrong', () => {
  const sure = { state: 'D' as const, critical: true, mixUps: ['Quarantine feels like the safe first move.', 'Moving clears the dock.', 'A third line.'] }

  test('shows the critical row, two mix-ups, what matters, the reflection and the return line, without the chosen-option line', async () => {
    await body(sure)
    expect(screen.getByLabelText('You chose: Move it to Quarantine bay Q1')).toBeOnTheScreen()
    expect(screen.queryByText('Quarantine is step two.')).toBeNull()
    expect(screen.getByLabelText('Critical step. Comes back first next session')).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Why it felt right' })).toBeOnTheScreen()
    expect(screen.getByText('Quarantine feels like the safe first move.')).toBeOnTheScreen()
    expect(screen.getByText('Moving clears the dock.')).toBeOnTheScreen()
    expect(screen.queryByText('A third line.')).toBeNull()
    expect(screen.getByRole('header', { name: 'What actually matters' })).toBeOnTheScreen()
    expect(screen.getByText('The receipt is your only proof.')).toBeOnTheScreen()
    expect(screen.getByLabelText('In one line: why does this matter?')).toBeOnTheScreen()
    expect(screen.getByText('Optional')).toBeOnTheScreen()
    expect(screen.getByLabelText('This comes back later this session.')).toBeOnTheScreen()
  })

  test('the reflection field shows the text it is given and reports edits, capped at 300', async () => {
    const onReflection = jest.fn()
    await body(sure, { reflection: 'Proof first', onReflection })
    const field = screen.getByLabelText('In one line: why does this matter?')
    expect(field).toHaveProp('value', 'Proof first')
    expect(field).toHaveProp('maxLength', 300)
    expect(field).toHaveProp('returnKeyType', 'done')
    await fireEvent.changeText(field, 'Proof before moving')
    expect(onReflection).toHaveBeenCalledWith('Proof before moving')
  })

  test('without mix-ups the chosen-option feedback stands in without a heading, and no critical row when not critical', async () => {
    await body({ state: 'D', critical: false, mixUps: [] })
    expect(screen.getByText('Quarantine is step two.')).toBeOnTheScreen()
    expect(screen.queryByText('Why it felt right')).toBeNull()
    expect(screen.queryByLabelText(/^Critical step/)).toBeNull()
  })
})

describe.each(['light', 'dark'] as const)('%s theme', (scheme) => {
  test('the critical row is ink on hairline dividers with no fill', async () => {
    const c = themes[scheme]
    await body({ state: 'D', critical: true }, { scheme })
    const row = screen.getByLabelText('Critical step. Comes back first next session')
    expect(row).toHaveStyle({ borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border })
    expect(row).not.toHaveStyle({ backgroundColor: expect.anything() })
    expect(screen.getByText('Critical step')).toHaveStyle({ color: c.ink, fontWeight: '700' })
  })

  test('captions are muted and values are the large body size', async () => {
    const c = themes[scheme]
    await body({}, { scheme })
    expect(screen.getByText('You chose')).toHaveStyle({ color: c.inkMuted, fontSize: 13, lineHeight: 18 })
    expect(screen.getByText('Move it to Quarantine bay Q1')).toHaveStyle({ color: c.ink, fontSize: 17, lineHeight: 26 })
    expect(screen.getByText('This comes back later this session.')).toHaveStyle({ color: c.inkMuted })
  })
})
