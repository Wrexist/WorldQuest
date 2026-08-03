/**
 * The locator map.
 *
 * These assert the RENDERED TREE rather than the props, for the reason `Flag.test.tsx`
 * records: react-native-web silently drops some accessibility props, so a test that
 * checks what we passed can pass while the DOM a screen reader reads has nothing in it.
 */

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CountryMap } from './CountryMap.js'
import { MAP_BY_PATH } from '../lib/maps.generated.js'
import { mapHeight, mapSource } from '../lib/maps.js'

const imgs = (container: HTMLElement) => Array.from(container.querySelectorAll('img'))

describe('CountryMap', () => {
  it('draws the country over the land around it, from real bundled artwork', () => {
    const { container } = render(
      <CountryMap path="geo/countries/SE.png" contextPath="geo/context/SE.png" width={240} />,
    )
    // Two layers, both resolving to a file we actually ship — not a placeholder.
    expect(imgs(container)).toHaveLength(2)
    for (const img of imgs(container)) expect(img.getAttribute('src')).toBeTruthy()
  })

  it('is decorative unless the picture is the only thing saying where you are', () => {
    // The country page names the country in a heading right beside this. A map that
    // announced itself would make a reader say "Sweden" twice.
    const { container } = render(
      <CountryMap path="geo/countries/SE.png" contextPath="geo/context/SE.png" width={240} />,
    )
    const frame = container.querySelector('[aria-hidden="true"]')
    expect(frame).toBeTruthy()
    expect(container.querySelector('[role="img"]')).toBeNull()
  })

  it('announces itself when it is asked to', () => {
    const { container } = render(
      <CountryMap
        path="geo/countries/SE.png"
        contextPath="geo/context/SE.png"
        width={240}
        label="Sweden in Europe"
      />,
    )
    const labelled = container.querySelector('[role="img"]')
    expect(labelled?.getAttribute('aria-label')).toBe('Sweden in Europe')
  })

  it('shows the slot rather than bare land with nothing highlighted', () => {
    // Land drawn with no country on it is a map of somewhere, captioned as a map of
    // somewhere else. Better to show the reserved space.
    const { container } = render(<CountryMap path={undefined} contextPath="geo/context/SE.png" width={240} />)
    expect(imgs(container)).toHaveLength(0)
  })

  it('keeps both layers the same size, because that is what registers them', () => {
    // The two PNGs are rasterised in one projection per country. If the boxes differ,
    // the highlight lands somewhere the country is not — a wrong fact drawn.
    const { container } = render(
      <CountryMap path="geo/countries/JP.png" contextPath="geo/context/JP.png" width={240} />,
    )
    const sizes = imgs(container).map((i) => i.parentElement?.getAttribute('style') ?? '')
    expect(new Set(sizes).size).toBe(1)
  })
})

describe('the map registry', () => {
  it('resolves every path the content pack promises', () => {
    // The pack is the contract; this is the assertion that we ship what it names.
    const pack = require('@worldquest/content/packs/geography/entities.countries.v1.json') as {
      items: { id: string; assets?: Record<string, { path: string }> }[]
    }
    const missing = pack.items.filter((i) => mapSource(i.assets?.['map']?.path) === undefined)
    expect(missing.map((m) => m.id)).toEqual([])
  })

  it('ships a context layer for every country, in that country\'s own frame', () => {
    // One per country, not one per continent. Each country is framed on itself now, so
    // its backdrop is the land around IT and cannot be shared with a neighbour.
    const pack = require('@worldquest/content/packs/geography/entities.countries.v1.json') as {
      items: { id: string; assets?: Record<string, { path: string }> }[]
    }
    const missing = pack.items.filter((i) => mapSource(i.assets?.['mapContext']?.path) === undefined)
    expect(missing.map((m) => m.id)).toEqual([])
  })

  it('has no artwork nobody claims', () => {
    // The inverse check, and the one that catches a country dropped from the pack
    // while its PNG stayed behind — dead weight in the download nobody would notice.
    const pack = require('@worldquest/content/packs/geography/entities.countries.v1.json') as {
      items: { id: string }[]
    }
    const claimed = new Set([
      ...pack.items.map((i) => `geo/countries/${i.id}.png`),
      ...pack.items.map((i) => `geo/context/${i.id}.png`),
    ])
    expect(Object.keys(MAP_BY_PATH).filter((p) => !claimed.has(p))).toEqual([])
  })

  it('derives height from one ratio, shared with the flags', () => {
    // Both land in the lesson prompt slot. Two ratios there means the answers below
    // move depending on which template came up.
    expect(mapHeight(240)).toBe(180)
  })
})
