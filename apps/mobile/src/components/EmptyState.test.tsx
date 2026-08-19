/**
 * `EmptyState` — the block a screen shows when it has nothing to show.
 *
 * ## Why these live here and not in `packages/design`
 *
 * That package's suite is `environment: 'node'` and `include: ['src/**\/*.test.ts']` — no
 * jsdom, no `react-native-web` alias, no `.tsx`. So no primitive in this repo has ever
 * had a test, not by a decision but because the only harness that can mount a React
 * Native component is this one. Duplicating it there means a second jsdom config and a
 * second copy of a 222-line setup file to keep in step.
 *
 * `apps/mobile` already depends on `@worldquest/design`, so importing across is the legal
 * direction. Moving these into the design package the day it grows a component harness is
 * a file move.
 *
 * ## What is worth asserting about a layout primitive
 *
 * Not "does it centre" — jsdom has no layout engine and would agree with any style object
 * put in front of it. What it can prove is the part the eight hand-rolled copies kept
 * getting wrong: that a screen cannot produce one of these without a heading a screen
 * reader can navigate to, and that every other slot is genuinely optional.
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { Button, EmptyState } from '@worldquest/design'

describe('EmptyState', () => {
  it('renders the title as a heading', () => {
    // The reason `title` is a required string rather than a node. A screen reader user
    // navigating by heading has to be able to land on the reason the screen is empty.
    render(<EmptyState title="No league yet" />)
    expect(screen.getByRole('heading', { name: 'No league yet' })).toBeDefined()
  })

  it('renders art, body, action and footnote when given them', () => {
    render(
      <EmptyState
        art={<Text>picture</Text>}
        title="Nothing to show yet"
        body="Finish your first lesson."
        action={<Button label="Start a lesson" onPress={() => {}} />}
        footnote={<Text>Coins come from lessons.</Text>}
      />,
    )
    expect(screen.getByText('picture')).toBeDefined()
    expect(screen.getByText('Finish your first lesson.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Start a lesson' })).toBeDefined()
    expect(screen.getByText('Coins come from lessons.')).toBeDefined()
  })

  it('renders nothing but the heading when given nothing else', () => {
    // Every optional slot is genuinely optional. League's offline state has no action —
    // there is nothing to retry on a train — and it must not render an empty button.
    const { container } = render(<EmptyState title="Offline" />)
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Offline' })).toBeDefined()
  })
})
