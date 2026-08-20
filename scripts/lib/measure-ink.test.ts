/**
 * The ink measurement, against a DOM this file builds.
 *
 * ## The bug these tests exist for
 *
 * `deadSpaceBelow` used to take the bottom of the deepest DESCENDANT of the scroller. A
 * `flex: 1` wrapper is a descendant that stretches to the bottom while painting nothing,
 * so every screen that centres an empty state inside a full-height container measured as
 * completely full — Profile's empty state, League's, and the paywall with no prices, the
 * exact three screens the measurement existed to find. It passed all three, and a human
 * reading the report was told the screens were fine.
 *
 * The second version then reported two of those same screens as 100 % full for a
 * different reason: League and the account form paint `bg.canvas` over the root gradient
 * themselves, and at 768 that fill is 600 × 1024 — full height, but not full width, so a
 * rule written about full-BLEED layers let it straight through.
 *
 * Both are cheap to state as a test and neither was catchable without a browser until
 * `MEASURE` moved into its own module. That move is most of the value here.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { MEASURE } = require_('./measure-ink.cjs') as { MEASURE: () => Measured }

type Measured = {
  readonly contentDensity: number
  readonly emptiestBand: { px: number; percentOfViewport: number; startsAtPercent: number }
  readonly deadSpaceBelow: { px: number; percentOfViewport: number } | null
  readonly sidewaysScroll: number
  readonly belowMinTarget: readonly unknown[]
  readonly unlabelledControls: number
}

/** Only the properties `MEASURE` reads. Anything it does not look at is left off. */
type Style = Partial<{
  visibility: string
  display: string
  opacity: string
  backgroundColor: string
  backgroundImage: string
  boxShadow: string
  overflowY: string
}> & { border?: number }

type Node = {
  tag?: string
  top: number
  height: number
  left?: number
  width?: number
  style?: Style
  /** Non-empty makes it a text leaf; children make it not a leaf. */
  text?: string
  kids?: number
}

const VIEWPORT = { width: 390, height: 800 }
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

const build = (nodes: readonly Node[], scroller?: Node & { scrollHeight?: number }) => {
  const all = [...(scroller === undefined ? [] : [scroller]), ...nodes]

  const element = (n: Node) => {
    const el = {
      tagName: n.tag ?? 'DIV',
      children: { length: n.kids ?? (n.text === undefined ? 1 : 0) },
      textContent: n.text ?? '',
      getBoundingClientRect: () => ({
        top: n.top,
        bottom: n.top + n.height,
        left: n.left ?? 0,
        right: (n.left ?? 0) + (n.width ?? VIEWPORT.width),
        width: n.width ?? VIEWPORT.width,
        height: n.height,
      }),
      getAttribute: () => null,
      // Only the scroller answers this, and only with the nodes inside it.
      querySelectorAll: () => nodes.map(element),
      clientHeight: n.height,
      scrollHeight: (n as { scrollHeight?: number }).scrollHeight ?? n.height,
      __style: n.style ?? {},
    }
    return el
  }

  const elements = all.map(element)

  globalThis.window = { innerWidth: VIEWPORT.width, innerHeight: VIEWPORT.height } as never
  globalThis.document = {
    documentElement: { scrollWidth: VIEWPORT.width, clientWidth: VIEWPORT.width },
    body: { querySelectorAll: () => elements.filter((e) => e !== elements[0] || scroller === undefined) },
    querySelectorAll: (selector: string) =>
      selector === '*' ? elements : [],
  } as never
  globalThis.getComputedStyle = ((el: { __style?: Style }) => {
    const s = el.__style ?? {}
    const border = s.border ?? 0
    return new Proxy(
      {
        visibility: s.visibility ?? 'visible',
        display: s.display ?? 'block',
        opacity: s.opacity ?? '1',
        backgroundColor: s.backgroundColor ?? TRANSPARENT,
        backgroundImage: s.backgroundImage ?? 'none',
        boxShadow: s.boxShadow ?? 'none',
        overflowY: s.overflowY ?? 'visible',
      } as Record<string, string>,
      {
        get: (target, key: string) =>
          key in target
            ? target[key]
            : /^border(Top|Right|Bottom|Left)Style$/.test(key)
              ? border > 0
                ? 'solid'
                : 'none'
              : /^border(Top|Right|Bottom|Left)Width$/.test(key)
                ? `${border}px`
                : /^border(Top|Right|Bottom|Left)Color$/.test(key)
                  ? border > 0
                    ? 'rgb(255, 255, 255)'
                    : TRANSPARENT
                  : '',
      },
    )
  }) as never
}

const CARD = { style: { backgroundColor: 'rgb(20, 30, 50)' } }

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).document
  delete (globalThis as Record<string, unknown>).getComputedStyle
})

describe('what counts as ink', () => {
  it('does not count a stretch wrapper that paints nothing', () => {
    // The empty state: 200 pt of real content at the top, inside a wrapper that reaches
    // the bottom of the screen and draws nothing. This is Profile-empty, and the old
    // measurement called it full.
    build([
      { top: 0, height: 800 },
      { top: 0, height: 200, ...CARD },
    ])
    const m = MEASURE()
    expect(m.contentDensity).toBe(25)
    expect(m.emptiestBand.percentOfViewport).toBe(75)
    expect(m.emptiestBand.startsAtPercent).toBe(25)
  })

  it('counts a full-height edgeless fill as backdrop at any width', () => {
    // League and the account form at 768: `flex: 1` plus `backgroundColor: bg.canvas`,
    // inside a 600 pt max-width column. Full height, three quarters of the width — which
    // a rule about full-BLEED layers lets straight through, and which reported two of the
    // emptiest screens in the app as 100 % full.
    build([
      { top: 0, height: 800, width: 300, style: { backgroundColor: 'rgb(7, 13, 27)' } },
      { top: 0, height: 200, ...CARD },
    ])
    expect(MEASURE().contentDensity).toBe(25)
  })

  it('counts a full-height surface that has an edge of its own', () => {
    // The escape hatch on the rule above. A backdrop is a fill and nothing else; anything
    // with a border, a shadow or text in it was drawn on purpose and is content whatever
    // its size.
    build([{ top: 0, height: 800, width: 300, style: { backgroundColor: 'rgb(7,13,27)', border: 1 } }])
    expect(MEASURE().contentDensity).toBe(100)
  })

  it('counts text leaves, images and bordered boxes', () => {
    build([
      { top: 0, height: 80, text: 'Everything Premium adds.', kids: 0 },
      { top: 400, height: 80, tag: 'IMG' },
      { top: 700, height: 80, style: { border: 2 } },
    ])
    // Three 80 pt bands out of 800.
    expect(MEASURE().contentDensity).toBe(30)
  })

  it('ignores hidden and fully transparent nodes', () => {
    build([
      { top: 0, height: 200, ...CARD },
      { top: 400, height: 200, style: { ...CARD.style, visibility: 'hidden' } },
      { top: 600, height: 200, style: { ...CARD.style, opacity: '0' } },
    ])
    expect(MEASURE().contentDensity).toBe(25)
  })
})

describe('the largest gap', () => {
  it('finds the hole between two blocks and says where it starts', () => {
    // The paywall with no prices: a headline at the top, the perk list and the footer at
    // the bottom, and the plan cards missing from between them.
    build([
      { top: 0, height: 160, ...CARD },
      { top: 560, height: 240, ...CARD },
    ])
    const m = MEASURE()
    expect(m.emptiestBand.px).toBe(400)
    expect(m.emptiestBand.percentOfViewport).toBe(50)
    expect(m.emptiestBand.startsAtPercent).toBe(20)
    expect(m.contentDensity).toBe(50)
  })

  it('is zero on a screen with something in every band', () => {
    build([{ top: 0, height: 800, ...CARD, width: 300 }, { top: 0, height: 800, ...CARD, width: 100 }])
    // Both are full-height fills with no edge, so both are backdrop — and a screen with
    // nothing but backdrop is 0 % ink, not 100 %.
    expect(MEASURE().contentDensity).toBe(0)
  })
})

describe('dead space below the content', () => {
  it('measures to the last PAINTED thing, not the last node', () => {
    build(
      [
        { top: 0, height: 800 },
        { top: 0, height: 200, ...CARD },
      ],
      { top: 0, height: 800, style: { overflowY: 'auto' }, scrollHeight: 800 },
    )
    expect(MEASURE().deadSpaceBelow).toEqual({ px: 600, percentOfViewport: 75 })
  })

  it('sees past a screen that fills its own root', () => {
    // League and the account form again, this time through the other measurement. Both
    // paint `bg.canvas` on the `flex: 1` root INSIDE the scroller, so without the same
    // backdrop rule the content bottom lands at the bottom of the window and the gap
    // reads as zero — the original bug, one measurement over.
    build(
      [
        { top: 0, height: 800, width: 300, style: { backgroundColor: 'rgb(7, 13, 27)' } },
        { top: 0, height: 200, ...CARD },
      ],
      { top: 0, height: 800, style: { overflowY: 'auto' }, scrollHeight: 800 },
    )
    expect(MEASURE().deadSpaceBelow).toEqual({ px: 600, percentOfViewport: 75 })
  })

  it('is zero when the screen has more in it than fits', () => {
    build(
      [{ top: 0, height: 1400, ...CARD }],
      { top: 0, height: 800, style: { overflowY: 'auto' }, scrollHeight: 1400 },
    )
    expect(MEASURE().deadSpaceBelow).toBe(0)
  })

  it('is null when nothing on the screen scrolls', () => {
    build([{ top: 0, height: 200, ...CARD }])
    expect(MEASURE().deadSpaceBelow).toBeNull()
  })
})
