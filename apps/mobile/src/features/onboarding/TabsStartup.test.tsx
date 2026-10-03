import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TabsLayout from '../../../app/(tabs)/_layout.js'
import { clearAll, writeJson } from '../../lib/storage.js'
import { __setOnlineForTests } from '../../lib/connectivity.js'

const { mountTabs } = vi.hoisted(() => ({ mountTabs: vi.fn() }))

vi.mock('expo-router', () => {
  const Tabs = () => {
    mountTabs()
    return <div data-testid="mounted-tabs">Home and tab images</div>
  }
  Tabs.Screen = () => null
  return { Tabs, Redirect: ({ href }: { href: string }) => <div data-testid="redirect">{href}</div> }
})

beforeEach(() => {
  clearAll()
  mountTabs.mockClear()
  __setOnlineForTests(true)
})

describe('tab startup gate', () => {
  it.each([true, false])('redirects a fresh install without mounting Home when online=%s', online => {
    __setOnlineForTests(online)
    render(<TabsLayout />)
    expect(screen.getByTestId('redirect').textContent).toBe('/onboarding')
    expect(mountTabs).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mounted-tabs')).toBeNull()
  })

  it('uses validated local completion, including after an offline restart', () => {
    writeJson('onboarding.v1', { completed: true, birthYear: 2002, isChild: false })
    __setOnlineForTests(false)
    render(<TabsLayout />)
    expect(screen.getByTestId('mounted-tabs')).toBeTruthy()
    expect(screen.queryByTestId('redirect')).toBeNull()
  })

  it('does not mount Home for malformed completion data', () => {
    writeJson('onboarding.v1', { completed: 'yes' })
    render(<TabsLayout />)
    expect(screen.getByTestId('redirect').textContent).toBe('/onboarding')
    expect(mountTabs).not.toHaveBeenCalled()
  })

  it('rechecks local completion instead of holding a stale startup decision', () => {
    const view = render(<TabsLayout />)
    expect(mountTabs).not.toHaveBeenCalled()
    writeJson('onboarding.v1', { completed: true, isChild: false })
    view.rerender(<TabsLayout />)
    expect(screen.getByTestId('mounted-tabs')).toBeTruthy()
    writeJson('onboarding.v1', { completed: false })
    view.rerender(<TabsLayout />)
    expect(screen.getByTestId('redirect').textContent).toBe('/onboarding')
    expect(screen.queryByTestId('mounted-tabs')).toBeNull()
  })
})
