import { createElement as h } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from './theme/ThemeProvider'
import { api } from './lib/api'
import Profile from './app/(tabs)/profile'
import PathScreen from './app/(tabs)/path'
import UnitScreen from './app/unit/[unitId]'
import QuickSessionScreen from './app/play/quick/[itemId]'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({ itemId: 'i1', unitId: 'u1', topicId: 't1' }),
  useScrollToTop: jest.fn(),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: () => false,
}))
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => true }))
jest.mock('./lib/auth', () => ({ getToken: () => 'learner-token' }))
jest.mock('./lib/session-store', () => ({ useSession: () => ({ status: 'ready', user: { name: 'Ana' }, branding: null }) }))
jest.mock('./lib/today', () => ({ useToday: () => ({ today: { topic: { id: 't1', title: 'Warehouse' } } }) }))
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn() }))
jest.mock('expo-audio', () => ({ requestRecordingPermissionsAsync: jest.fn(), useAudioStream: () => ({}) }))
jest.mock('./lib/unit-procedure', () => ({ useUnitProcedure: () => null }))
jest.mock('./lib/api', () => ({ ...jest.requireActual('./lib/api'), api: jest.fn() }))

const path = {
  topic: { id: 't1', title: 'Warehouse' }, benchmark: 0.85, preparing: false,
  units: [{ id: 'u1', name: 'Receiving', order: 0, summary: '', mastery: 0.8, measured: true,
    state: 'learning', unlocked: true, canPractice: true, criticalCount: 0, source: null, concepts: [] }],
}
const profile = { name: 'Ana', role: null, started: true, mastery: 0.66, benchmark: 0.85,
  onboarding: { day: 16, days: 30 }, proficiency: { achievedAt: null, projectedAt: null }, weeks: [], units: [], confidentErrors: [] }
const session = {
  id: 's1', kind: 'mini', topicId: 't1', topicTitle: 'Warehouse', ended: false,
  progress: { position: 1, total: 1 },
  item: { id: 'i1', conceptId: 'c1', conceptName: 'Safety', format: 'mcq', stem: 'Which is safe?',
    options: [{ id: 'o1', text: 'Use a team lift' }, { id: 'o2', text: 'Lift alone' }], blank: null, image: null, difficulty: 1 },
}
const cases = [
  { name: 'Profile', Component: Profile, status: 'Loading your progress', payload: profile, content: 'Day 16 of 30' },
  { name: 'Path', Component: PathScreen, status: 'Loading your path', payload: path, content: 'Receiving' },
  { name: 'Unit', Component: UnitScreen, status: 'Loading this unit', payload: path, content: 'Concepts' },
  { name: 'Quick question', Component: QuickSessionScreen, status: 'Loading your question', payload: { sessionId: 's1' }, content: 'Which is safe?' },
]
const windowSize = Dimensions.get('window')
afterEach(() => Dimensions.set({ window: windowSize }))

describe.each(['light', 'dark'] as const)('%s loading status at 200% font scale', (scheme) => {
  describe.each(cases)('$name', ({ Component, status, payload, content }) => {
    test.each(['success', 'error'] as const)('announces once while delayed, then yields to %s', async (outcome) => {
      Dimensions.set({ window: { ...windowSize, width: 320, fontScale: 2 } })
      let resolve!: (value: unknown) => void
      let reject!: (reason: Error) => void
      const pending = new Promise((yes, no) => { resolve = yes; reject = no })
      jest.mocked(api).mockReset().mockImplementation((url) => url === '/sessions/s1' ? Promise.resolve(session) as never : pending as never)
      const element = h(ThemeProvider, { scheme, children: h(Component) })
      await render(element)
      const line = screen.getByText(status)
      const announcement = screen.getByRole('status')
      expect(announcement).toHaveProp('accessibilityLiveRegion', 'polite')
      expect(line).toHaveStyle({ color: themes[scheme].inkMuted })
      expect(line.props.numberOfLines).toBeUndefined()
      expect(line.props.allowFontScaling).not.toBe(false)
      expect(line.props.maxFontSizeMultiplier).toBeUndefined()
      expect(screen.getAllByRole('status')).toHaveLength(1)
      await screen.rerender(element)
      expect(screen.getByRole('status')).toBe(announcement)
      expect(jest.mocked(api)).toHaveBeenCalledTimes(1)

      await act(async () => {
        if (outcome === 'success') resolve(payload)
        else reject(new Error('Network unavailable'))
      })
      expect(screen.queryByText(status)).toBeNull()
      if (outcome === 'success') {
        expect(screen.getByText(content, { includeHiddenElements: true })).toBeOnTheScreen()
      } else {
        const retry = screen.getByRole('button', { name: 'Try again' })
        expect(screen.queryByRole('status')).toBeNull()
        jest.mocked(api).mockImplementation((url) => Promise.resolve(url === '/sessions/s1' ? session : payload) as never)
        await fireEvent.press(retry)
        expect(await screen.findByText(content, { includeHiddenElements: true })).toBeOnTheScreen()
        expect(screen.queryByText(status)).toBeNull()
      }
    })
  })
})
