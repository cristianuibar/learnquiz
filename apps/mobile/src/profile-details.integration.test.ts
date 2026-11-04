import { createElement } from 'react'
import { render, screen } from '@testing-library/react-native'
import type { Profile } from '@learnquiz/api/progress'
import { UnitAccordion } from './components/profile/UnitAccordion'
import { CriticalSteps } from './components/profile/CriticalSteps'
import { Bar } from './components/ui/Bar'
import { ThemeProvider } from './theme/ThemeProvider'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('./components/ui/Bar', () => ({ Bar: jest.fn(jest.requireActual('./components/ui/Bar').Bar) }))

beforeEach(() => { jest.clearAllMocks() })

test.each(['not_started', 'locked'] as const)('%s accordion bars stay empty despite a seeded mastery', async (state) => {
  const units: Profile['units'] = [{ id: 'u', name: 'Safety', mastery: 0.9, state, concepts: [] }]
  await render(createElement(ThemeProvider, { children: createElement(UnitAccordion, { units, benchmark: 0.85 }) }))
  expect(jest.mocked(Bar).mock.calls[0][0]).toMatchObject({ value: 0, benchmark: 85, estimate: false })
})

test('Comes back first uses the design’s right-hand arrowhead', async () => {
  await render(createElement(ThemeProvider, { children: createElement(CriticalSteps, {
    confidentErrors: [{ id: 'a', conceptId: 'c', concept: 'Check sign-off', at: 0, correctedAt: null }],
  }) }))
  expect(screen.getByLabelText('Comes back first')).toBeOnTheScreen()
  const paths = screen.root!.queryAll((node) => typeof node.props.d === 'string').map((path) => path.props.d)
  // Lucide RotateCw places its arrowhead at the right of the rotation arc.
  expect(paths).toContain('M21 3v5h-5')
})
