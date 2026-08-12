import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Art } from './Art.js'
import { ART_BY_NAME, type ArtName } from '../lib/art.generated.js'

/**
 * Thirteen screens draw an illustration through this component, and every one of them
 * relies on two behaviours that are invisible in a screenshot: that the name resolves
 * to a real bundled file, and that the picture stays OUT of the accessibility tree.
 *
 * The second is the one worth a test. Every placement sits beside a heading and a body
 * that already say what the screen means — "You're all caught up" with a telescope next
 * to it does not become clearer when a screen reader announces the telescope, it
 * becomes twice as long. That is a decision the component makes on every caller's
 * behalf, silently, and a regression in it would be caught by nobody looking at the
 * app.
 */
describe('Art', () => {
  it('draws the real artwork for every name the build generated', () => {
    // Every name, not a sample. The index is generated from what `pnpm build:art`
    // actually wrote, so this is also the check that nothing in it points at a file
    // the bundler could not resolve — the failure mode that renders a blank box on a
    // device and nothing at all in CI.
    for (const name of Object.keys(ART_BY_NAME) as ArtName[]) {
      const { container } = render(<Art name={name} size={64} />)
      const img = container.querySelector('img')
      expect(img, `${name} rendered no image`).toBeTruthy()
      expect(img?.getAttribute('src') ?? '', `${name} resolved to nothing`).not.toBe('')
    }
  })

  it('hides the image from the accessibility tree by default', () => {
    const { container } = render(<Art name="states/empty-caught-up" size={64} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    // An empty `alt` is what makes a decorative image skipped rather than announced by
    // its filename, which is the default a browser falls back to.
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  /**
   * The letterbox that made onboarding's first hero a bordered rectangle.
   *
   * `onboarding/explore` measures as a whole frame, so fitting its subject fits its 3:2
   * frame, and a 3:2 frame in a 390×220 band is 330 wide with 30 points of canvas down
   * each side. `bleed` took the border off and left the gap; `fill` is what closes it.
   *
   * Asserted as "at least as wide as the box" rather than against a number, because the
   * number is a function of the shipped geometry and this is not a test of the geometry.
   */
  it('fills a box that is wider than the art, rather than letterboxing inside it', () => {
    const box = { width: 390, height: 220 }
    const bleed = render(
      <Art name="onboarding/explore" size={box.width} height={box.height} frame="bleed" />,
    )
    const fill = render(
      <Art name="onboarding/explore" size={box.width} height={box.height} frame="fill" />,
    )
    // The element carrying the size is react-native-web's `Image` wrapper; the `img`
    // inside it is the source, drawn to fill its parent.
    const widthOf = (r: ReturnType<typeof render>) =>
      Number.parseFloat(
        (r.container.querySelector('img')?.parentElement as HTMLElement | null)?.style.width ??
          '0',
      )

    expect(widthOf(bleed)).toBeLessThan(box.width)
    expect(widthOf(fill)).toBeGreaterThanOrEqual(box.width)
  })

  /**
   * …and the half of `fill` that a plain `cover` would get wrong.
   *
   * A cutout carries a wide transparent margin, so covering the box with its FRAME would
   * blow the subject up until only a detail of it was left. `fill` takes whichever of the
   * two is larger, which for a cutout is still the subject fit.
   */
  it('does not blow a cutout up to cover the box', () => {
    const box = { width: 390, height: 220 }
    const widthOf = (frame: 'bleed' | 'fill') =>
      Number.parseFloat(
        (
          render(
            <Art name="onboarding/learn" size={box.width} height={box.height} frame={frame} />,
          ).container.querySelector('img')?.parentElement as HTMLElement | null
        )?.style.width ?? '0',
      )

    expect(widthOf('fill')).toBe(widthOf('bleed'))
  })

  it('announces the image when a caller passes a label', () => {
    // No caller does yet — there is no screen where the picture carries information the
    // text does not. The path exists so that when one arrives it is a prop rather than
    // a rewrite, and it is tested so that it still works when it is first used.
    const { container } = render(
      <Art name="atlas/celebrate" size={64} label="Atlas jumping for joy" />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('alt')).toBe('Atlas jumping for joy')
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
