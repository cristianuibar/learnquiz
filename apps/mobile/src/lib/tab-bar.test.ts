import { isTabDisabled, pressTab } from './tab-bar'

function press(opts: { focused: boolean; disabled?: boolean; defaultPrevented?: boolean }) {
  const emit = jest.fn(() => ({ defaultPrevented: opts.defaultPrevented ?? false }))
  const navigate = jest.fn()
  pressTab({ routeKey: 'today-key', focused: opts.focused, disabled: opts.disabled ?? false, emit, navigate })
  return { emit, navigate }
}

describe('pressTab', () => {
  it('re-tapping the focused tab emits tabPress once and does not navigate', () => {
    const { emit, navigate } = press({ focused: true })
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'today-key', canPreventDefault: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('tapping an inactive tab emits tabPress and navigates', () => {
    const { emit, navigate } = press({ focused: false })
    expect(emit).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('does not navigate when a listener prevents the default', () => {
    const { emit, navigate } = press({ focused: false, defaultPrevented: true })
    expect(emit).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does nothing for a disabled tab', () => {
    const { emit, navigate } = press({ focused: false, disabled: true })
    expect(emit).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('isTabDisabled', () => {
  it('disables path while there is no today or no topic', () => {
    expect(isTabDisabled('path', null)).toBe(true)
    expect(isTabDisabled('path', undefined)).toBe(true)
    expect(isTabDisabled('path', { topic: null })).toBe(true)
  })

  it('enables path once a topic exists', () => {
    expect(isTabDisabled('path', { topic: { id: 't1' } })).toBe(false)
  })

  it('never disables today or profile', () => {
    for (const name of ['today', 'profile']) {
      expect(isTabDisabled(name, null)).toBe(false)
      expect(isTabDisabled(name, { topic: null })).toBe(false)
    }
  })
})
