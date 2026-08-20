/**
 * What the browser measures on every design shot.
 *
 * ## Why it lives in its own file
 *
 * It is handed to `page.evaluate`, which serialises the function and runs it inside
 * Chromium — so it can close over nothing, import nothing, and be reached by no test
 * that does not have a browser. That is how the old version of this measurement shipped
 * a bug that made it agree with every screen it was written to catch.
 *
 * Here it is a plain export instead, driven in `measure-ink.test.ts` against a stub DOM
 * that answers `getBoundingClientRect` and `getComputedStyle` with whatever a case needs.
 * The rules about what counts as ink are then testable in milliseconds, and the browser
 * run stays the only place that decides what the DOM actually looks like.
 *
 * The body must stay self-contained for the same reason: a `require` at the top of this
 * file is fine, a reference to one from INSIDE `MEASURE` is a `ReferenceError` in
 * Chromium that no test here would see.
 */

/**
 * Measured on every shot — routes and states alike.
 *
 * One function, so the route pass and the state pass cannot drift into measuring two
 * different things.
 */
const MEASURE = () => {
  const doc = document.documentElement
  const vw = window.innerWidth
  const vh = window.innerHeight

  /**
   * Does this node put anything on the screen?
   *
   * The question the old measurement never asked. It took the bottom of the deepest
   * DESCENDANT, and a `flex: 1` wrapper is a descendant that stretches to the bottom of
   * its scroller while painting nothing at all — so every screen that centres an empty
   * state inside a full-height container measured as completely full. That is the shape
   * of Profile-empty, League-empty and the paywall with no prices, which is to say the
   * three screens the measurement existed to find. It passed all three.
   *
   * A node paints if it has its own surface — a fill, an image, a border, a shadow — or
   * if it is a leaf with text in it. Anything else is scaffolding holding the things
   * that do.
   */
  /** An edge of its own: a border on any side, with width and a colour that shows. */
  const hasBorder = (style) =>
    ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) =>
        style[`border${side}Style`] !== 'none' &&
        parseFloat(style[`border${side}Width`]) > 0 &&
        !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(style[`border${side}Color`]),
    )

  const paints = (node) => {
    const style = getComputedStyle(node)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    if (Number(style.opacity) === 0) return false
    if (/^(IMG|SVG|CANVAS|VIDEO|INPUT|TEXTAREA|SELECT|HR)$/.test(node.tagName)) return true
    const bg = style.backgroundColor
    if (bg !== '' && bg !== 'transparent' && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(bg)) return true
    if (style.backgroundImage !== '' && style.backgroundImage !== 'none') return true
    if (style.boxShadow !== '' && style.boxShadow !== 'none') return true
    if (hasBorder(style)) return true
    // A text leaf. `node.children` is elements only, so a `<div>Sweden</div>` — which is
    // what react-native-web makes of a `<Text>` — lands here.
    return node.children.length === 0 && (node.textContent ?? '').trim() !== ''
  }

  /**
   * A backdrop: something painted behind everything, rather than something on the screen.
   *
   * Dropped, because counting it would make every screen 100 % full and this whole
   * measurement a constant. The canvas gradient is the obvious one. The subtle one is a
   * screen that paints `bg.canvas` over that gradient itself — League and the account
   * form both do, and at 768 that fill is 600 × 1024, so a rule about covering the whole
   * WIDTH let it through and reported two of the emptiest screens in the app as
   * completely full. A backdrop is defined by height and by having no edge of its own,
   * not by width.
   *
   * Anything with a border, a shadow, a picture or text in it is a surface somebody drew
   * on purpose, at any size. Nothing in this app is content, 95 % of the viewport tall,
   * and edgeless.
   */
  const isBackdrop = (node, r, style) => {
    if (r.height < vh * 0.95) return false
    if (/^(IMG|SVG|CANVAS|VIDEO|INPUT|TEXTAREA|SELECT|HR)$/.test(node.tagName)) return false
    if (style.boxShadow !== '' && style.boxShadow !== 'none') return false
    if (hasBorder(style)) return false
    return !(node.children.length === 0 && (node.textContent ?? '').trim() !== '')
  }

  /** Every painted box that is not a backdrop, clipped to the viewport. */
  const boxes = []
  for (const node of document.body.querySelectorAll('*')) {
    const r = node.getBoundingClientRect()
    if (r.height < 1 || r.width < 1) continue
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue
    if (!paints(node)) continue
    if (isBackdrop(node, r, getComputedStyle(node))) continue
    boxes.push({ top: Math.max(r.top, 0), bottom: Math.min(r.bottom, vh) })
  }

  /**
   * Ink, by row.
   *
   * The viewport in 4 px bands; a band is inked if any painted box crosses it. Two
   * numbers come out of the one scan, and they answer different questions:
   *
   * - `contentDensity` — what fraction of the screen's height has anything on it. A
   *   screen can have no gap at the bottom and still be 30 % ink spread thinly over a
   *   tall page, which is the paywall with no prices.
   * - `emptiestBand` — the largest unbroken run of nothing, and where it starts. This is
   *   the one a person recognises from the screenshot: the hole in the middle.
   *
   * Rows rather than a 2-D grid on purpose. These layouts are a single column, so a
   * horizontal measure would report the side margins as emptiness on every screen in the
   * app and say nothing about any of them.
   */
  const ROW = 4
  const rows = Math.ceil(vh / ROW)
  const inked = new Uint8Array(rows)
  for (const b of boxes) {
    const from = Math.max(0, Math.floor(b.top / ROW))
    const to = Math.min(rows - 1, Math.ceil(b.bottom / ROW) - 1)
    for (let i = from; i <= to; i++) inked[i] = 1
  }
  let filled = 0
  let run = 0
  let best = { rows: 0, at: 0 }
  for (let i = 0; i < rows; i++) {
    if (inked[i] === 1) {
      filled++
      run = 0
      continue
    }
    run++
    if (run > best.rows) best = { rows: run, at: i - run + 1 }
  }
  const contentDensity = Math.round((filled / rows) * 100)
  const emptiestBand =
    best.rows === 0
      ? { px: 0, percentOfViewport: 0, startsAtPercent: 0 }
      : {
          px: best.rows * ROW,
          percentOfViewport: Math.round((best.rows / rows) * 100),
          startsAtPercent: Math.round((best.at / rows) * 100),
        }

  /**
   * How much of the viewport below the content is empty.
   *
   * Measured from the bottom of the deepest thing actually PAINTED in the scroll area to
   * the top of whatever is pinned below it — a footer, the tab bar — or to the bottom of
   * the window when nothing is. Zero on any screen that scrolls, which is most of them;
   * large only where short fixed content hangs from the top of a tall screen.
   *
   * Deliberately NOT a gate. A meditation screen might want to be mostly empty, "mostly
   * empty" is sometimes the design, and a threshold here would either fire on those or
   * be set so loose it fires on nothing. The number goes in the report and a person
   * decides. Same for the two above.
   */
  const deadSpaceBelow = (() => {
    const scroller = Array.from(document.querySelectorAll('*')).find((node) => {
      const style = getComputedStyle(node)
      return /^(auto|scroll)$/.test(style.overflowY) && node.clientHeight > 200
    })
    if (scroller === undefined) return null
    // A screen with more in it than fits has no dead space by definition.
    if (scroller.scrollHeight > scroller.clientHeight + 4) return 0
    const box = scroller.getBoundingClientRect()
    let contentBottom = box.top
    for (const node of scroller.querySelectorAll('*')) {
      const r = node.getBoundingClientRect()
      if (r.height < 1 || r.width < 1 || r.top > box.bottom) continue
      if (!paints(node)) continue
      // The same backdrop rule as above. Without it a screen that fills its own root
      // reports a content bottom at the bottom of the window, which is the bug this
      // whole pass was rewritten to fix, reappearing one measurement later.
      if (isBackdrop(node, r, getComputedStyle(node))) continue
      contentBottom = Math.max(contentBottom, Math.min(r.bottom, box.bottom))
    }
    const gap = Math.round(box.bottom - contentBottom)
    return { px: gap, percentOfViewport: Math.round((gap / vh) * 100) }
  })()

  const interactive = Array.from(
    document.querySelectorAll('[role="button"],[role="tab"],[role="radio"],[role="link"]'),
  )
  const small = interactive
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ el, r }) => ({
      label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 32),
      size: `${Math.round(r.width)}×${Math.round(r.height)}`,
    }))
  const unlabelled = interactive.filter(
    (el) =>
      (el.getAttribute('aria-label') ?? '').trim() === '' && (el.textContent ?? '').trim() === '',
  ).length

  return {
    sidewaysScroll: doc.scrollWidth - doc.clientWidth,
    belowMinTarget: small,
    unlabelledControls: unlabelled,
    deadSpaceBelow,
    contentDensity,
    emptiestBand,
    headings: Array.from(document.querySelectorAll('[role="heading"]'))
      .map((h) => (h.textContent ?? '').trim())
      .slice(0, 4),
  }
}


module.exports = { MEASURE }
