import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CollectionScreen, type CollectionTile } from './CollectionScreen.js'

const tiles: readonly CollectionTile[] = [
  { id: 'SE', name: 'Sweden', subtitle: 'Stockholm', collected: true, favourite: true },
  { id: 'NO', name: 'Norway', subtitle: 'Oslo', collected: true },
  { id: 'JP', name: 'Japan', subtitle: 'Tokyo', collected: false, favourite: true },
  { id: 'CI', name: "Côte d'Ivoire", subtitle: 'Yamoussoukro', collected: false },
]

const renderCollection = (over: Partial<Parameters<typeof CollectionScreen>[0]> = {}) =>
  render(<CollectionScreen title="Countries" tiles={tiles} {...over} />)

const chip = (name: string) => screen.getByRole('radio', { name })

describe('Collection — the tiles', () => {
  it('shows what the user does not have yet, dimmed but readable', () => {
    // The single most common mistake in this genre is hiding unearned content. Seeing
    // the shape of the gap is the motivation; hiding it makes the collection feel
    // small instead of making the gap feel closeable.
    renderCollection()
    expect(screen.getByText('Japan')).toBeTruthy()
    expect(screen.getByText("Côte d'Ivoire")).toBeTruthy()
  })

  it('never calls an uncollected tile locked', () => {
    // Nothing is being withheld — the user simply has not learned it yet.
    const { container } = renderCollection()
    expect(container.textContent).not.toMatch(/locked/i)
  })

  it('counts rather than reporting a percentage', () => {
    // "2 of 4" says how far the next one is. "50%" says nothing a user can act on.
    renderCollection()
    expect(screen.getByText('2 of 4')).toBeTruthy()
  })

  it('puts collected state in the label, not only in the dimming', () => {
    renderCollection({ onOpen: vi.fn() })
    expect(screen.getByRole('button', { name: /Norway, Oslo, Collected/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Japan, Tokyo, Not collected yet/ })).toBeTruthy()
  })

  it('opens a tile', () => {
    const onOpen = vi.fn()
    renderCollection({ onOpen })
    fireEvent.click(screen.getByRole('button', { name: /Norway/ }))
    expect(onOpen).toHaveBeenCalledWith('NO')
  })
})

describe('Collection — search', () => {
  it('is diacritic-insensitive, because nobody types the circumflex', () => {
    renderCollection()
    fireEvent.change(screen.getByLabelText('Search countries…'), { target: { value: 'cote' } })
    expect(screen.getByText("Côte d'Ivoire")).toBeTruthy()
    expect(screen.queryByText('Sweden')).toBeNull()
  })

  it('offers a way onward when nothing matches', () => {
    renderCollection()
    fireEvent.change(screen.getByLabelText('Search countries…'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No match for/)).toBeTruthy()
    expect(screen.getByText(/browse by continent/)).toBeTruthy()
  })
})

describe('Collection — filters', () => {
  it('filters to collected', () => {
    renderCollection()
    fireEvent.click(chip('Collected'))
    expect(screen.getByText('Sweden')).toBeTruthy()
    expect(screen.queryByText('Japan')).toBeNull()
  })

  it('filters to what is still to find', () => {
    renderCollection()
    fireEvent.click(chip('Still to find'))
    expect(screen.getByText('Japan')).toBeTruthy()
    expect(screen.queryByText('Sweden')).toBeNull()
  })

  it('filters to starred, across both collected and uncollected', () => {
    // Starring is orthogonal to collecting. A user who starred Japan before learning
    // it must still find it here — filtering starred down to "starred and collected"
    // would hide the exact countries they marked because they wanted to get to them.
    renderCollection()
    fireEvent.click(chip('Starred'))
    expect(screen.getByText('Sweden')).toBeTruthy()
    expect(screen.getByText('Japan')).toBeTruthy()
    expect(screen.queryByText('Norway')).toBeNull()
    expect(screen.queryByText("Côte d'Ivoire")).toBeNull()
  })

  it('tells a screen reader which filter is on', () => {
    renderCollection()
    fireEvent.click(chip('Starred'))
    expect(chip('Starred').getAttribute('aria-checked')).toBe('true')
    expect(chip('All').getAttribute('aria-checked')).toBe('false')
  })

  it('says a tile is starred in its label, not only with a glyph', () => {
    renderCollection({ onOpen: vi.fn() })
    expect(screen.getByRole('button', { name: /Sweden.*Starred/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Norway.*Starred/ })).toBeNull()
  })
})

describe('Collection — the three empty states', () => {
  it('sends an empty collection to a lesson', () => {
    const onStartLesson = vi.fn()
    renderCollection({ tiles: [], onStartLesson })
    expect(screen.getByText('Nothing here yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start a lesson' }))
    expect(onStartLesson).toHaveBeenCalledOnce()
  })

  it('sends an empty starred list to a star, not to a lesson', () => {
    // The bug this exists to prevent: offering "Start a lesson" to a user who has
    // starred nothing sends them to the one place that cannot fix it.
    renderCollection({
      tiles: [{ id: 'NO', name: 'Norway', collected: true }],
      onStartLesson: vi.fn(),
    })
    fireEvent.click(chip('Starred'))

    expect(screen.getByText('Nothing starred yet')).toBeTruthy()
    expect(screen.getByText(/tap the star/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start a lesson' })).toBeNull()
  })

  it('shows the collection arriving rather than a spinner', () => {
    const { container } = renderCollection({ loading: true })
    expect(container.textContent).not.toMatch(/Nothing here yet/)
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = renderCollection()
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
