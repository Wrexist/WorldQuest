import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react'
import { AccessibilityInfo, Animated } from 'react-native'
import { setAppReducedMotion, useReducedMotion } from '@worldquest/design'
import { withFullMotion } from '../../test/setup.js'
import { ExploreAtlas, type ExploreAtlasProps } from './ExploreAtlas.js'

const globe = vi.hoisted(() => ({ status: undefined as undefined | ((status: 'error') => void) }))
const dimensions = vi.hoisted(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 }))
vi.mock('react-native', async importOriginal => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useWindowDimensions: () => dimensions,
}))

// The globe renderer has its own resource-lifetime tests. Here, its element identity
// proves a card transition never remounts the expensive sibling or its camera.
vi.mock('./WorldAtlasView.js', () => ({
  WorldAtlasView: ({ onStatusChange }: { onStatusChange: (status: 'error') => void }) => {
    globe.status = onStatusChange
    return <div data-testid="persistent-globe" />
  },
}))

const countries = [
  { id: 'ES', name: 'Spain', region: 'EU' },
  { id: 'JP', name: 'Japan', region: 'AS' },
]
const capitals: Record<string, string> = { 'geo.ES.capital': 'Madrid', 'geo.JP.capital': 'Tokyo' }
const names = {
  countryName: (id: string) => countries.find(country => country.id === id)?.name,
  factValueName: (id: string) => capitals[id],
}
const props = (changes: Partial<ExploreAtlasProps> = {}): ExploreAtlasProps => ({
  countries, names, selected: 'ES', region: null, matches: [],
  onSelect: vi.fn(), onRegion: vi.fn(), onOpenCountry: vi.fn(), ...changes,
})

afterEach(() => {
  dimensions.width = 390
  dimensions.fontScale = 1
  setAppReducedMotion(false)
  vi.restoreAllMocks()
})

async function readyMotionPreference() {
  const preference = renderHook(useReducedMotion)
  await waitFor(() => expect(preference.result.current).toBe(false))
  preference.unmount()
}

describe('Explore country-card arrival', () => {
  it('keeps country selection and opening usable after a GPU failure', () => {
    const onOpenCountry = vi.fn()
    const view = render(<ExploreAtlas {...props({ onOpenCountry })} />)
    act(() => globe.status?.('error'))
    expect(view.queryByTestId('persistent-globe')).toBeNull()
    expect(view.getByTestId('explore-map-fallback').querySelector('img')?.getAttribute('src')).toContain('/geo/clay/ES.webp')
    fireEvent.click(view.getByRole('button', { name: 'Open Spain' }))
    expect(onOpenCountry).toHaveBeenCalledWith('ES')
    view.rerender(<ExploreAtlas {...props({ selected: 'JP', onOpenCountry })} />)
    expect(view.getByTestId('explore-map-fallback').querySelector('img')?.getAttribute('src')).toContain('/geo/clay/JP.webp')
    expect(view.queryByTestId('persistent-globe')).toBeNull()
  })

  it('opens directly from the compact details and keeps dismissal separate at large text sizes', () => {
    const onOpenCountry = vi.fn()
    const onSelect = vi.fn()
    const initial = props({ onOpenCountry, onSelect })
    const view = render(<ExploreAtlas {...initial} />)
    const card = view.getByTestId('explore-atlas-card')
    const close = view.getByRole('button', { name: 'Clear selection' })
    const open = view.getByRole('button', { name: 'Open Spain' })
    const globe = view.getByTestId('persistent-globe')
    expect(open.contains(view.getByRole('heading', { name: 'Spain' }))).toBe(true)
    expect(open.contains(view.getByText('Capital: Madrid'))).toBe(true)
    expect(open.contains(close)).toBe(false)
    expect(view.queryByText('Open Spain')).toBeNull()
    fireEvent.click(open)
    expect(onOpenCountry).toHaveBeenLastCalledWith('ES')
    expect(onSelect).not.toHaveBeenCalled()

    dimensions.fontScale = 2
    view.rerender(<ExploreAtlas {...initial} />)
    expect(view.getByTestId('explore-atlas-card')).toBe(card)
    expect(view.getByRole('button', { name: 'Clear selection' })).toBe(close)
    expect(view.getByRole('button', { name: 'Open Spain' })).toBe(open)
    expect(view.getByTestId('persistent-globe')).toBe(globe)

    dimensions.fontScale = 1
    dimensions.width = 320
    view.rerender(<ExploreAtlas {...initial} />)
    expect(open.contains(view.getByRole('heading', { name: 'Spain' }))).toBe(true)
    view.rerender(<ExploreAtlas {...initial} selected="JP" />)
    expect(view.getByRole('button', { name: 'Open Japan' })).toBe(open)
    expect(view.getByRole('button', { name: 'Clear selection' })).toBe(close)
    expect(view.getByTestId('persistent-globe')).toBe(globe)
    fireEvent.click(close)
    expect(onSelect).toHaveBeenLastCalledWith(null)
    expect(onOpenCountry).toHaveBeenCalledTimes(1)
  })

  it('settles for each new country while preserving the globe, controls and live region', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn(), reset: vi.fn() })
    await withFullMotion(async () => {
      await readyMotionPreference()
      const onOpenCountry = vi.fn()
      const initial = props({ onOpenCountry })
      const view = render(<ExploreAtlas {...initial} />)
      await waitFor(() => expect(timing).toHaveBeenCalledTimes(1))
      const globe = view.getByTestId('persistent-globe')
      const card = view.getByTestId('explore-atlas-card')
      const open = view.getByRole('button', { name: 'Open Spain' })
      const close = view.getByRole('button', { name: 'Clear selection' })
      expect(card.getAttribute('aria-live')).toBe('polite')
      fireEvent.click(open)
      expect(onOpenCountry).toHaveBeenLastCalledWith('ES')

      // Query/progress/name hydration produces new arrays and functions without a
      // new selection. It must not bounce the card again or steal keyboard focus.
      close.focus()
      view.rerender(<ExploreAtlas {...initial} countries={[...countries]} names={{ ...names }} matches={['ES']} />)
      expect(timing).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(close)

      view.rerender(<ExploreAtlas {...initial} selected="JP" />)
      expect(timing).toHaveBeenCalledTimes(2)
      expect(view.getByTestId('persistent-globe')).toBe(globe)
      expect(view.getByTestId('explore-atlas-card')).toBe(card)
      expect(view.getByRole('button', { name: 'Open Japan' })).toBe(open)
      expect(document.activeElement).toBe(close)
      expect(view.getByText('Capital: Tokyo')).toBeTruthy()
      fireEvent.click(open)
      expect(onOpenCountry).toHaveBeenLastCalledWith('JP')
    })
  })

  it('allows dismissal during arrival and keeps the card dismissed through query refreshes', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const stop = vi.fn()
    vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop, reset: vi.fn() })
    function Controlled({ matches }: { matches: string[] }) {
      const [selected, onSelect] = useState<string | null>('ES')
      return <ExploreAtlas {...props()} selected={selected} onSelect={onSelect} matches={matches} />
    }
    await withFullMotion(async () => {
      await readyMotionPreference()
      const view = render(<Controlled matches={[]} />)
      await act(async () => { await Promise.resolve() })
      const globe = view.getByTestId('persistent-globe')
      fireEvent.click(view.getByRole('button', { name: 'Clear selection' }))
      expect(view.queryByTestId('explore-atlas-card')).toBeNull()
      expect(stop).toHaveBeenCalled()
      view.rerender(<Controlled matches={['ES', 'JP']} />)
      expect(view.queryByTestId('explore-atlas-card')).toBeNull()
      expect(view.getByTestId('persistent-globe')).toBe(globe)
    })
  })

  it('shows the final card immediately under reduced motion', async () => {
    setAppReducedMotion(true)
    const timing = vi.spyOn(Animated, 'timing')
    const onOpenCountry = vi.fn()
    const view = render(<ExploreAtlas {...props({ onOpenCountry })} />)
    await act(async () => { await Promise.resolve() })
    view.rerender(<ExploreAtlas {...props({ selected: 'JP', onOpenCountry })} />)
    expect(timing).not.toHaveBeenCalled()
    expect(view.getByTestId('explore-atlas-card').style.transform).toContain('translateY(0px)')
    expect(view.getByTestId('explore-atlas-card').style.transform).toContain('scale(1)')
    fireEvent.click(view.getByRole('button', { name: 'Open Japan' }))
    expect(onOpenCountry).toHaveBeenCalledWith('JP')
  })
})

describe('Explore country browser', () => {
  it('starts collapsed and selects a country without opening its page', () => {
    const onSelect = vi.fn()
    const onOpenCountry = vi.fn()
    const view = render(<ExploreAtlas {...props({ onSelect, onOpenCountry })} />)
    const disclosure = view.getByRole('button', { name: 'Browse countries (2)' })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByRole('list', { name: 'Countries on the map' })).toBeNull()
    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByRole('button', { name: 'Spain' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(view.getByRole('button', { name: 'Japan' }))
    expect(onSelect).toHaveBeenCalledWith('JP')
    expect(onOpenCountry).not.toHaveBeenCalled()
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByRole('list', { name: 'Countries on the map' })).toBeNull()
  })

  it('filters the list and count together, and yields to active search results', () => {
    const initial = props()
    const view = render(<ExploreAtlas {...initial} />)
    const globe = view.getByTestId('persistent-globe')
    fireEvent.click(view.getByTestId('explore-atlas-browse'))
    view.rerender(<ExploreAtlas {...initial} region="AS" />)
    expect(view.getByRole('button', { name: 'Browse countries (1)' }).getAttribute('aria-expanded')).toBe('true')
    expect(view.queryByRole('button', { name: 'Spain' })).toBeNull()
    expect(view.getByRole('button', { name: 'Japan' })).toBeTruthy()
    view.rerender(<ExploreAtlas {...initial} showBrowse={false} matches={['JP']} />)
    expect(view.queryByTestId('explore-atlas-browse')).toBeNull()
    expect(view.queryByRole('list', { name: 'Countries on the map' })).toBeNull()
    expect(view.getByTestId('persistent-globe')).toBe(globe)
  })
})
