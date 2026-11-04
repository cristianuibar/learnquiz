import { createElement as h, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ItemView, Reveal } from '@learnquiz/api'
import SessionScreen from './app/play/[sessionId]/index'
import { api } from './lib/api'
import { ThemeProvider } from './theme/ThemeProvider'

// The real session screen and reveal; only the network, storage, native sheet and question dock are fakes.
jest.mock('expo-router', () => {
  const router = { replace: jest.fn() }
  return { useLocalSearchParams: () => ({ sessionId: 'session-574' }), useRouter: () => router, useFocusEffect: jest.fn() }
})
jest.mock('expo-image', () => ({ Image: require('react-native').Image }))
jest.mock('expo-audio', () => ({ useAudioStream: () => ({ stream: { start: jest.fn(), stop: jest.fn() }, isStreaming: false }), requestRecordingPermissionsAsync: jest.fn() }))
jest.mock('./components/question/diagram-image', () => ({ DiagramImage: () => null }))
jest.mock('./components/session/ReadAloudButton', () => ({ ReadAloudButton: () => null }))
jest.mock('./lib/api', () => ({ api: jest.fn(), postForm: jest.fn() }))
jest.mock('./lib/haptics', () => ({ resultHaptic: jest.fn() }))
jest.mock('./lib/session-store', () => ({ useSession: () => ({ branding: null }) }))
jest.mock('./lib/session/draft', () => ({
  draftForView: jest.fn(async () => ({ answer: { optionId: 'record' }, confidence: 'sure' })),
  writeDraft: jest.fn(async () => {}),
  deleteDraft: jest.fn(async () => {}),
}))
jest.mock('./components/ui/Screen', () => ({ useHeadingFocus: jest.fn() }))
jest.mock('./components/session/SessionFrame', () => ({
  SessionFrame: ({ children, dock }: { children: ReactNode; dock?: ReactNode }) => require('react').createElement(require('react').Fragment, null, children, dock),
}))
jest.mock('./components/session/QuestionDock', () => ({
  QuestionDock: ({ onSubmit }: { onSubmit(): void }) => {
    const { Pressable, Text } = require('react-native')
    const { createElement } = require('react')
    return createElement(Pressable, { accessibilityRole: 'button', onPress: onSubmit }, createElement(Text, null, 'Check'))
  },
}))
jest.mock('./components/sheet/sheet-host', () => ({
  SheetHost: ({ children, sheet }: { children: ReactNode; sheet?: ReactNode }) => require('react').createElement(require('react').Fragment, null, children, sheet),
}))
jest.mock('./components/sheet/sheet', () => ({
  Sheet: (props: { band?: ReactNode; body: ReactNode; foot?: ReactNode }) => {
    const { View } = require('react-native')
    const { createElement } = require('react')
    return createElement(View, null, props.band, props.body, props.foot)
  },
}))

const item: ItemView = {
  id: 'item-574', conceptId: 'receiving', conceptName: 'Receiving', format: 'mcq', stem: 'What comes first?',
  options: [{ id: 'record', text: 'Record the damage' }], blank: null, image: null, difficulty: 1,
}
const sureCorrect: Reveal = {
  diagramConceptId: null, attemptId: 'attempt-574', state: 'A', correct: true, xp: 10, critical: false, correctOptionIds: ['record'], detail: null,
  score: 1, feedback: null, missingPoints: [], correctAnswer: 'Record the damage', chosenFeedback: null, explanation: 'Record before moving.',
  sourceQuote: 'Photograph the damage before moving anything.', sourceTitle: 'Receiving SOP', sourceVersion: 3, mixUps: [], returnsThisSession: false,
  pKnownBefore: 0.2, pKnownAfter: 0.5,
}

beforeEach(() => jest.clearAllMocks())

test.each([true, false])('a correct, sure answer opens the explanation only in a back-to-basics session (basics: %s)', async (basics) => {
  jest.mocked(api).mockImplementation(async (path: string) => path.endsWith('/answer') ? sureCorrect
    : { id: 'session-574', item, ended: false, progress: { position: 1, total: 20 }, basics })
  await render(h(ThemeProvider, { children: h(SessionScreen) }))
  await fireEvent.press(await screen.findByRole('button', { name: 'Check' }))
  expect(await screen.findByRole('button', { name: 'Why', expanded: basics })).toBeOnTheScreen()
  expect(screen.queryByText('Record before moving.') !== null).toBe(basics)
})
