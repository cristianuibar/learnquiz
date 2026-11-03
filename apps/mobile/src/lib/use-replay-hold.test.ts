import { createElement, useEffect } from 'react'
import { Text } from 'react-native'
import { act, renderRouter, screen } from 'expo-router/testing-library'
import { router, Stack } from 'expo-router'
import { holdTarget, releaseReplayHolds, takeHeldTarget, takeReplayTarget } from './held-target'
import { useReplayHold } from './use-replay-hold'

jest.mock('expo-router/build/toolbar/native', () => ({ RouterToolbarHost: 'View', RouterToolbarItem: 'View' }))
jest.mock(require.resolve('expo-glass-effect', { paths: [require.resolve('expo-router')] }), () => ({
  GlassView: 'View', isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false,
}))

// A screen that holds replay as soon as it shows, like Join after its first submit.
function Join() {
  const holdReplay = useReplayHold()
  useEffect(() => { holdReplay() }, [holdReplay])
  return createElement(Text, null, 'Join')
}
const Other = () => createElement(Text, null, 'Other')
// A stack keeps Join mounted underneath when another screen is pushed.
const routes = { _layout: () => createElement(Stack), index: Other, 'join/[invitationId]': Join, other: Other }

beforeEach(() => { releaseReplayHolds(); takeHeldTarget() })

test('a Join screen buried under another screen releases its hold', async () => {
  await renderRouter(routes, { initialUrl: '/join/inv-1' })
  holdTarget('/unit/u1')
  expect(screen.getByText('Join')).toBeOnTheScreen()
  expect(takeReplayTarget()).toBeNull()
  await act(async () => { router.push('/other') })
  expect(screen.getByText('Other')).toBeOnTheScreen()
  expect(screen.getByText('Join', { includeHiddenElements: true })).toBeTruthy()
  expect(takeReplayTarget()).toBe('/unit/u1')
})

test('leaving Join releases its hold', async () => {
  await renderRouter(routes, { initialUrl: '/join/inv-1' })
  holdTarget('/unit/u1')
  expect(takeReplayTarget()).toBeNull()
  await act(async () => { router.replace('/other') })
  expect(takeReplayTarget()).toBe('/unit/u1')
})
