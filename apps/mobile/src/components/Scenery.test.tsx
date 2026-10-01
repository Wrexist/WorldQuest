/**
 * `Scenery` — the decorative places around the path and the celebrations.
 *
 * Three promises: a pack can only name art that exists (and a hostile name draws
 * nothing), none of it reaches a screen reader, and whoever stands on the island is
 * still rendered — the stage decorates a figure, it never replaces one.
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import pack from '../../../../packages/content/packs/courses/first-week.v1.json'
import { FloatingProp, IslandStage, SceneryBanner, isSceneryName } from './Scenery.js'

describe('Scenery', () => {
  it('knows every scenery the shipped course names', () => {
    for (const unit of pack.items) expect(isSceneryName((unit as { scenery?: string }).scenery)).toBe(true)
  })

  it('draws nothing for a name it does not own, including a prototype key', () => {
    expect(isSceneryName(undefined)).toBe(false)
    expect(isSceneryName('atlantis')).toBe(false)
    expect(isSceneryName('constructor')).toBe(false)
  })

  it('keeps banners and props away from assistive technology', () => {
    render(<>
      <SceneryBanner name="europe" height={120} />
      <SceneryBanner name="discovery-island" height={120} />
      <FloatingProp name="compass" size={72} phase={0} />
    </>)
    for (const id of ['scenery-europe', 'scenery-discovery-island', 'path-prop-compass']) {
      expect(screen.getByTestId(id).getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('still draws whoever stands on the island', () => {
    render(<IslandStage size={200}><Text>Atlas</Text></IslandStage>)
    expect(screen.getByText('Atlas')).toBeTruthy()
    expect(screen.getByTestId('island-stage').getAttribute('aria-hidden')).toBe('true')
  })
})
