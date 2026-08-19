/**
 * `AbsentContent` — the stand-in that keeps a missing thing's shape.
 *
 * Lives here rather than in `packages/design` for the reason `EmptyState.test.tsx`
 * gives: that package's suite is node-only and cannot mount a component.
 *
 * ## The case that shaped the component
 *
 * The first version made `loading` a bare `Skeleton` and threw its children away, on the
 * reasoning that a shimmer with words on it is a lie. `PaywallScreen.test.tsx` failed
 * inside five minutes — that screen deliberately says "Checking prices with the store"
 * while it waits, and the decision is older than this component and better than the
 * rule. Hence `keeps its message while loading` below: the case is now asserted twice,
 * from the primitive's side and from the screen's.
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { AbsentContent } from '@worldquest/design'

const ALL = ['loading', 'error', 'offline', 'unavailable'] as const

describe('AbsentContent', () => {
  it('keeps its message while loading', () => {
    render(
      <AbsentContent state="loading" minHeight={120} label="Checking prices">
        <Text>Checking prices with the store</Text>
      </AbsentContent>,
    )
    expect(screen.getByText('Checking prices with the store')).toBeDefined()
  })

  it('shows the message and names the region in every state', () => {
    for (const state of ALL) {
      const { container, unmount } = render(
        <AbsentContent state={state} minHeight={120} label="Prices">
          <Text>Something to read</Text>
        </AbsentContent>,
      )
      expect(container.querySelectorAll('[aria-label="Prices"]')).toHaveLength(1)
      expect(screen.getByText('Something to read')).toBeDefined()
      unmount()
    }
  })

  it('announces only the error state as an alert', () => {
    // Being on a train is not a failure, a plan we never configured is not the user's
    // problem, and a moment is not an event. One of the four interrupts.
    const alerts = ALL.map((state) => {
      const { container, unmount } = render(
        <AbsentContent state={state} minHeight={120} label="Prices">
          <Text>Nothing to show.</Text>
        </AbsentContent>,
      )
      const count = container.querySelectorAll('[role="alert"]').length
      unmount()
      return [state, count] as const
    })
    expect(alerts).toEqual([
      ['loading', 0],
      ['error', 1],
      ['offline', 0],
      ['unavailable', 0],
    ])
  })

  it('treats the footprint as a floor rather than a fixed height', () => {
    // `minHeight`, not `height`. At 200 % text the message inside grows, and a fixed
    // height clips the sentence explaining why the screen is empty — on the screen least
    // able to afford it.
    const { container } = render(
      <AbsentContent state="error" minHeight={120} label="Prices">
        <Text>Long</Text>
      </AbsentContent>,
    )
    const box = container.querySelector('[aria-label="Prices"]') as HTMLElement
    expect(box.style.minHeight).toBe('120px')
    expect(box.style.height).toBe('')
  })
})
