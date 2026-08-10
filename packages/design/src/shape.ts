/**
 * How a corner is drawn, as opposed to how big it is.
 *
 * `radius` is the token — 8, 12, 16, 20, 28. This is the other half of the same
 * decision, and until now the app never made it: every rounded rectangle in the product
 * was a **circular** corner, which is the CSS default and the React Native default and
 * is not what iOS draws.
 *
 * iOS has used a continuous curve — a squircle — for every rounded rectangle it draws
 * since iOS 7: app icons, alerts, sheets, buttons, grouped list groups, the keyboard,
 * the home indicator's own container. A circular corner meets its straight edge at a
 * point where the curvature jumps from zero to 1/r; a continuous one ramps into it, so
 * the transition has no visible corner-of-the-corner. Nobody can name the difference and
 * everybody sees it: side by side, the circular version is what a web framework or an
 * Android app looks like.
 *
 * It is one property, it is free, and it is the single strongest cue that a control
 * belongs to the platform — which is why it is the first thing in the iOS audit
 * (docs/design/ios-native-audit.md, N1).
 *
 * ## Where it does and does not belong
 *
 * Spread it wherever a `borderRadius` is smaller than half the shape — cards, buttons,
 * chips, panels, tiles, art frames.
 *
 * NOT on `radius.full`. A shape whose radius exceeds half its smaller side is a circle or
 * a stadium; there is no straight edge for the curve to ramp into, so `continuous` is at
 * best a no-op and at worst a renderer clamping it oddly. Avatars, dots, pills and
 * progress tracks stay as they are.
 *
 * ## Android and web
 *
 * `borderCurve` is iOS-only. Android and react-native-web ignore it and draw the
 * circular corner they drew before, which is correct on both counts: Material's own
 * shape language IS circular, and nothing about the web expects a squircle. So this is
 * not a fallback — it is a platform detail that each platform answers in its own idiom.
 * Nothing here needs a `Platform.select`.
 */

import type { ViewStyle } from 'react-native'

/** Spread into any style that sets a `borderRadius` below `radius.full`. */
export const squircle = { borderCurve: 'continuous' } as const satisfies ViewStyle
