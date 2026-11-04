import { createElement as h, createRef } from 'react'
import { Text as NativeText } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { StreakPill } from '../ui/StreakPill'
import { TodayTopBar } from './TodayTopBar'

jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }))
jest.mock('../../lib/session-store', () => ({ useSession: () => ({ branding: null, user: null }) }))
jest.mock('../../lib/api', () => ({ mediaSource: jest.fn() }))
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => true }))

describe.each(['light', 'dark'] as const)('%s Today streak', (scheme) => {
  test.each([false, true])('20dp flame, reward %s; shared default remains 16dp', async (reward) => {
    await render(h(ThemeProvider, { scheme, children: h(TodayTopBar, {
      streak: { text: '4 days', label: '4 days in a row' }, streakCount: 4, reward, popIn: true, headingRef: createRef<NativeText>(),
    }) }))
    const pill = screen.getByRole('text', { name: '4 days in a row' })
    const flame = pill.children[0] as typeof pill
    expect(flame).toHaveProp('width', 20)
    expect(flame).toHaveProp('height', 20)
    expect(screen.queryByRole('image')).toBeNull()
    await screen.rerender(h(ThemeProvider, { scheme, children: h(StreakPill, { count: 4, variant: reward ? 'reward' : 'quiet' }) }))
    const defaultFlame = screen.getByRole('text', { name: '4 days in a row' }).children[0] as typeof pill
    expect(defaultFlame).toHaveProp('width', 16)
    expect(defaultFlame).toHaveProp('height', 16)
  })
})
