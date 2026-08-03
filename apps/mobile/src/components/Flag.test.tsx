import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Flag } from './Flag.js'
import { flagHeight } from '../lib/flags.js'

/**
 * Any FLAG artwork on screen, ignoring the placeholder's own icon.
 *
 * "no `<img>`" used to mean "no flag", because the placeholder was a text glyph.
 * The placeholder now holds a real icon, so the blunt check would pass for a
 * component that rendered Poland's flag for Sweden — the exact bug these two tests
 * exist to catch. Match on the flags directory instead.
 */
const flagArtwork = (container: HTMLElement): HTMLImageElement | null =>
  Array.from(container.querySelectorAll('img')).find((i) =>
    /flags\//.test(i.getAttribute('src') ?? ''),
  ) ?? null

describe('Flag', () => {
  it('draws the real artwork for a path the bundle has', () => {
    const { container } = render(<Flag path="flags/SE.png" width={72} />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toMatch(/SE\.png/)
  })

  it('falls back to the placeholder rather than another country’s flag', () => {
    // The tempting alternative — nearest match, or the region's colour with a code on
    // it — eventually shows a child the wrong flag. A wrong fact is the one bug class
    // this repo treats as unshippable, so missing must render nothing rather than
    // something plausible.
    const { container } = render(<Flag path="flags/ZZ.png" width={72} />)
    expect(flagArtwork(container)).toBeNull()
  })

  it('draws the placeholder when the pack declares no flag at all', () => {
    const { container } = render(<Flag path={undefined} width={72} />)
    expect(flagArtwork(container)).toBeNull()
  })

  it('is 4:3, which is what the source set draws', () => {
    // Not decoration. The slot this replaced was 3:2, and rendering flag-icons' 4:3
    // artwork into it would have stretched Japan's disc into an ellipse — a wrong fact
    // drawn rather than written, and invisible in a diff.
    expect(flagHeight(72)).toBe(54)
    expect(flagHeight(200)).toBe(150)
  })

  it('is silent by default, because the text beside it already says the country', () => {
    // Asserted against the rendered tree rather than against the props, because the
    // first version of this component passed `alt` — which react-native-web drops on
    // the floor. It read correctly and announced nothing.
    const { container } = render(<Flag path="flags/SE.png" width={72} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  it('announces itself when it IS the question', () => {
    // The lesson prompt is the one place a flag carries information nothing else on
    // screen does. It should not reach a screen-reader user — they get the described
    // sibling template — but an unlabelled image is not something to ship on the
    // strength of "should not".
    const { container } = render(
      <Flag path="flags/SE.png" width={200} label="Which country’s flag is this?" />,
    )
    expect(container.querySelector('[aria-label="Which country’s flag is this?"]')).toBeTruthy()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe(
      'Which country’s flag is this?',
    )
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
