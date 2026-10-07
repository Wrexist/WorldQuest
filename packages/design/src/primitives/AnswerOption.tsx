import { createThemeStyles } from '../theme.js'
/** Soft clay answer surfaces retain semantic borders and non-colour verdict marks.
 * Only transform/opacity move, through reduced-motion-aware native helpers.
 * Wrong answers remain calm and every label keeps its intrinsic text height. */

import { useEffect, useState } from 'react'
import {
  Animated,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { radius, space } from '../tokens.js'
import { useAnimatedTo, useReducedMotion } from '../motion.js'
import { squircle } from '../shape.js'
import { text } from '../typography.js'
import { ClaySurface, clayShadow } from './ClaySurface.js'

export type AnswerState = 'idle' | 'selected' | 'correct' | 'wrong' | 'disabled'

export type AnswerOptionProps = {
  label: string
  state?: AnswerState
  onPress: () => void
  /**
   * Announced instead of the bare label, e.g. "Japan, correct answer".
   *
   * This prop carried that example in its own doc comment and **nothing ever passed
   * it**, so the correct/wrong state reached a screen reader through exactly nothing:
   * the mark is `aria-hidden` artwork and the surface colour is invisible to a reader.
   * A user heard "Berlin", four times, with no way to tell which one they got wrong.
   * `| undefined` explicitly, because `exactOptionalPropertyTypes` distinguishes an
   * absent prop from one passed as undefined and the caller computes it per state.
   */
  accessibilityLabel?: string | undefined
  /**
   * The correct/wrong mark, supplied by the caller as a node.
   *
   * The artwork is an app asset and this package may not reach into
   * `apps/mobile/assets`. Falls back to a geometric character when absent — see
   * GLYPHS below for why that fallback is tolerable and still not preferred.
   */
  mark?: React.ReactNode
  /**
   * The option drawn as a PICTURE, with `label` demoted to its accessible name.
   *
   * "Hur ser Belgiens flagga ut?" used to be answered by reading four written
   * descriptions and picking one — a comprehension question about Swedish prose, in the
   * one place the app had a picture of the answer and did not use it. When the option is
   * a thing you can look at, looking at it IS the question.
   *
   * A node rather than a path, for the reason `mark` is: the artwork lives in
   * `apps/mobile/assets` and this package may not reach across. The caller passes a
   * `<Flag>`; this decides where it sits and how much room it gets.
   *
   * `label` is NOT dropped when this is present — it becomes the accessible name via
   * `aria-label`, so a screen-reader user hears the description they always heard and a
   * sighted user sees the flag. That is the whole reason this did not need a second
   * template and an `equivalentTemplate` pairing: nothing was taken away from anybody.
   */
  art?: React.ReactNode
  /**
   * The letter on the badge — "A", "B", "C", "D".
   *
   * Optional, and absent means no badge at all rather than an empty circle: a two-option
   * question reads fine without a rail, and a caller that has not decided should get
   * nothing instead of decoration.
   *
   * Hidden from the screen reader by the caller's `accessibilityLabel`, which already
   * names the option and its state. "A, Rome, correct answer" is one letter of noise in
   * front of every option; the badge is a visual rail, not information.
   */
  badge?: string | undefined
  style?: StyleProp<ViewStyle>
  testID?: string
}

type Skin = {
  face: string
  edge: string
  label: string
  /**
   * The colour thrown OUTWARD by a state that means something.
   *
   * Only the three states that are answers to something — chosen, right, wrong. An idle
   * option glows at nothing, and a screen where every row glows has no glow, just haze.
   */
  glow?: string
  /** Filled badge, for the same reason the mark exists: colour must never be alone. */
  badgeFill?: string
}



/**
 * The non-colour half of every state signal — colour may never carry meaning alone
 * (docs/design/accessibility.md), and ~8 % of men are red/green colour-blind.
 *
 * A fallback, not the plan: the caller SHOULD pass `mark`, and the lesson does. These
 * two survive because they are geometric characters rather than emoji — monochrome,
 * present in every font, and they respect `color`. The arrow is still the weak one:
 * `→` does not mirror for RTL, which is exactly why `mark` exists.
 */
const GLYPHS: Record<AnswerState, string | null> = {
  idle: null,
  selected: null,
  correct: '✓',
  wrong: '→',
  disabled: null,
}

const FACE_HEIGHT = 56

/**
 * The size of a disc on this card — the letter badge, and the mark's coin over a picture.
 *
 * ONE constant for both, because they are the same object at two positions and a card
 * showing a 30pt badge beside a 34pt coin reads as a mistake. It was written twice, once
 * inline in `badge` and once as the coin's own value, which is how those two drift.
 *
 * Not a token: the space scale is 4/8/12/16/24/32/40/48/64 and this is deliberately none
 * of them — it is the diameter that holds a 20pt icon plus its 2pt ring with the padding
 * a tap target wants, which is a property of these two discs and not a value any other
 * component should reach for. `packages/design/CLAUDE.md` asks for a token where a value
 * is reusable; a second reader is what would earn one.
 *
 * The coin overlaps the artwork's corner deliberately: floating in the gap beside a flag
 * it is a fifth object in the row, and biting into the corner it reads as attached to the
 * thing it is about.
 */
const DISC = 30

export function AnswerOption({
  label,
  state = 'idle',
  onPress,
  accessibilityLabel,
  mark,
  art,
  badge,
  style,
  testID,
}: AnswerOptionProps) {
  const { SKINS, styles } = useThemeValues()
  const isInert = state === 'disabled' || state === 'correct' || state === 'wrong'
  const skin = SKINS[state]
  const reduced = useReducedMotion()
  const [pressed, setPressed] = useState(false)
  const press = useAnimatedTo(pressed && !isInert && !reduced ? 1 : 0, 'press')
  useEffect(() => {
    if (!pressed) return
    if (isInert || AppState.currentState === 'background' || AppState.currentState === 'inactive') {
      setPressed(false)
      return
    }
    // Losing the app can cancel the gesture without delivering onPressOut.
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') setPressed(false)
    })
    return () => subscription?.remove?.()
  }, [isInert, pressed])

  const fallbackGlyph = GLYPHS[state]
  const glyph =
    mark ??
    (fallbackGlyph === null ? null : (
      <Text style={[styles.glyph, { color: skin.edge }]}>{fallbackGlyph}</Text>
    ))

  /**
   * The mark arriving, rather than being there.
   *
   * `expressive` is the only token whose easing overshoots (`Easing.out(back)`), which
   * is exactly the pop this wants: the tick lands a shade too big and settles. Through
   * `useAnimatedTo` so it collapses to a zero-duration jump when the user has asked for
   * less movement — the tick still appears, it just does not travel. It is also seeded
   * at its target, so a render with no effects (the screenshot harness) draws the
   * finished state instead of an invisible one.
   *
   * Called unconditionally, before the branch that decides whether there IS a mark,
   * because that is what hooks require — the value simply sits at 0 until there is
   * something to show.
   */
  const arrive = useAnimatedTo(glyph === null ? 0 : 1, 'expressive')
  const arriving = {
    opacity: arrive,
    transform: [{ scale: arrive.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
  }

  return (
    <Pressable
      accessible
      role="button"
      aria-label={accessibilityLabel ?? label}
      aria-selected={state === 'selected'}
      aria-disabled={isInert}
      disabled={isInert}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onBlur={() => setPressed(false)}
      testID={testID}
      style={[styles.target, style]}
    >
      {/* The face compresses inside a stationary target. Input never waits for the
          release, and feedback states settle without another press gesture. */}
      <Animated.View style={[
        styles.card,
        { backgroundColor: skin.face, borderColor: skin.edge },
        pressed && !isInert && styles.pressed,
        { transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }] },
      ]}>
      {state !== 'disabled' && <ClaySurface radius={radius.lg} transparent={state !== 'idle'} />}
      {badge !== undefined && (
        <View
          style={[
            styles.badge,
            skin.badgeFill !== undefined && { backgroundColor: skin.badgeFill, borderColor: skin.badgeFill },
          ]}
          // The rail is visual. `accessibilityLabel` already says "A, Rome, correct
          // answer" or better, and a reader announcing the letter twice is noise.
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          <Text
            style={[styles.badgeText, skin.badgeFill !== undefined && styles.badgeTextOn]}
          >
            {badge}
          </Text>
        </View>
      )}

      {/* NO `numberOfLines`. The line above it used to read "never truncate a
          country name — let it wrap and grow" and then capped it at two, which is
          long enough for every country name and is not what the answers are made of.

          Flag questions are answered with descriptions, and on a device the four
          options for "Hur ser Japans flagga ut?" rendered as

            "fjorton röda och vita ränder, med en gul halvmåne och stjärna på en bl…"
            "tre vågräta band — saffransgult, vitt, grönt — med ett mörkblått hj…"

          Two of the four cut off mid-word. An option you cannot read is an option you
          cannot choose, so a question with two of them is not a question — and the
          user is charged a heart for guessing at it.

          An uncapped label can grow, and growing is the correct failure: the lesson
          screen scrolls (`pnpm scrollable` proves it), so a long answer costs space.
          A truncated one costs the answer. */}
      {art !== undefined ? (
        // Hidden from the reader, exactly like the badge and the mark: `aria-label`
        // above already announces the description this picture replaces, and a decoded
        // image would announce it a second time or, worse, announce a filename.
        <View style={styles.art} importantForAccessibility="no-hide-descendants" aria-hidden>
          <View style={styles.artFrame}>
            {art}
          </View>
        </View>
      ) : (
        /* NO `numberOfLines`. The line above it used to read "never truncate a
           country name — let it wrap and grow" and then capped it at two, which is
           long enough for every country name and is not what the answers are made of.

           Flag questions are answered with descriptions, and on a device the four
           options for "Hur ser Japans flagga ut?" rendered as

             "fjorton röda och vita ränder, med en gul halvmåne och stjärna på en bl…"
             "tre vågräta band — saffransgult, vitt, grönt — med ett mörkblått hj…"

           Two of the four cut off mid-word. An option you cannot read is an option you
           cannot choose, so a question with two of them is not a question — and the
           user is charged a heart for guessing at it.

           An uncapped label can grow, and growing is the correct failure: the lesson
           screen scrolls (`pnpm scrollable` proves it), so a long answer costs space.
           A truncated one costs the answer.

           Still the right rendering wherever there is no picture — every attribute but
           `flag` answers in words, and the described-flag templates deliberately do too
           so that a screen-reader user has a question to be asked. */
        <Text style={[styles.label, badge === undefined && styles.labelCentre, { color: skin.label }]}>
          {label}
        </Text>
      )}

      {/* A picture option's mark, in the CARD's corner rather than on the picture.

          It used to hang off the flag's trailing bottom corner, and the wrong-answer
          feedback then said "a shield at the right" about a Fiji flag whose shield the
          coin was covering (audit 2026-10-06). The mark must never hide the thing being
          taught. Absolute, so it costs no layout and the flag still does not move — the
          reason it left the row in the first place. */}
      {art !== undefined && glyph !== null && (
        <Animated.View
          style={[styles.coin, { borderColor: skin.edge }, arriving]}
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          {glyph}
        </Animated.View>
      )}

      {/* The row-level mark, for the options made of words. */}
      {art === undefined && glyph !== null && (
        <Animated.View
          style={[styles.glyphWrap, arriving]}
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          {glyph}
        </Animated.View>
      )}
      </Animated.View>
    </Pressable>
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const SKINS: Record<AnswerState, Skin> = {
  idle: {
    face: colors.option.idle,
    edge: colors.border.subtle,
    label: colors.text.primary,
  },
  selected: {
    face: colors.option.selected,
    edge: colors.option.selectedEdge,
    label: colors.text.primary,
    badgeFill: colors.option.selectedEdge,
  },
  correct: {
    face: colors.option.correct,
    edge: colors.feedback.correct,
    label: colors.text.primary,
    badgeFill: colors.feedback.correct,
  },
  wrong: {
    face: colors.option.wrong,
    edge: colors.status.hearts,
    label: colors.text.primary,
    // The one state that most needs the non-colour signal was the one state missing it.
    // `selected` and `correct` both fill their badge; `wrong` drew its arrow on the bare
    // track, so the strongest thing distinguishing the option a user got wrong from an
    // idle one was hue — exactly what `badgeFill`'s own comment says may never happen.
    badgeFill: colors.status.hearts,
  },
  disabled: {
    face: colors.option.idle,
    edge: colors.border.subtle,
    label: colors.text.tertiary,
  },
}
  const styles = StyleSheet.create({
  target: {
    alignSelf: 'stretch',
    minHeight: FACE_HEIGHT,
  },
  card: {
    minHeight: FACE_HEIGHT,
    flexGrow: 1,
    borderRadius: radius.lg,
    ...squircle,
    ...clayShadow(colors),
    // Two pixels, all the way round. The ring is what separates one option from the
    // next at a glance; without it four dark rectangles on a dark screen become one
    // shape and the eye has to do the work of finding the boundaries.
    borderWidth: 2,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  // Also signals the press under reduced motion, when the face does not compress.
  pressed: { opacity: 0.7 },
  badge: {
    width: DISC,
    height: DISC,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...text('caption', { weight: '800' }), color: colors.text.tertiary },
  badgeTextOn: { color: colors.text.onStatus },
  /**
   * Where a picture-answer sits: the whole row minus the rail, centred in it.
   *
   * Centred rather than hung off the badge, which is the opposite of what the label
   * does, and deliberately. Text is READ, so it starts at the writing direction's start
   * edge and the four starts line up into a column the eye can run down. A flag is
   * LOOKED AT, and four flags of different aspect ratios pinned to the start edge leave
   * a ragged gap down the trailing half of the card. Centred, the four read as four
   * plates on a shelf.
   *
   * No height here. The caller sizes its own artwork — the design package cannot know
   * what a flag's aspect ratio is, and a fixed box would letterbox Nepal's pennant and
   * crop Switzerland's square.
   */
  art: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /**
   * Shrink-wrapped around the artwork. `alignSelf: 'center'` rather than a width: the
   * caller sizes its own flag.
   */
  artFrame: { alignSelf: 'center', position: 'relative' },
  /**
   * The mark's disc, in the card's top trailing corner — off the artwork, so it never
   * covers the detail the feedback names.
   *
   * `end` rather than `right`, so it mirrors with the writing direction along
   * with everything else on the card.
   *
   * Dark disc, coloured ring, coloured mark: the fill is the app's own canvas colour
   * rather than the state colour, because the state colour is what the MARK is, and a
   * green tick on a green disc is not a tick. It also has to survive being drawn on top
   * of any flag in the world — a white field, a red one, a yellow one — and a near-black
   * coin with a lit edge is the one combination that reads on all of them. Same idea as
   * the card's own lit edge, at a smaller radius.
   */
  coin: {
    position: 'absolute',
    end: space[1],
    top: space[1],
    width: DISC,
    height: DISC,
    borderRadius: radius.full,
    borderWidth: 2,
    backgroundColor: colors.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Alignment is stated only for the BADGELESS case, and that is an RTL decision.
   *
   * With a badge the text should hang off the rail, which means the writing direction's
   * own start edge — and React Native has no `textAlign: 'start'` (its union is
   * auto/left/right/center/justify, which `pnpm lint:a11y` rightly refuses to let a
   * component pick from). `auto` IS the start edge: it follows the writing direction, so
   * it sits left in English and right in Arabic with nothing to remember.
   *
   * So the default does the RTL-correct thing and only the centred case is declared.
   */
  label: { ...text('bodyStrong'), color: colors.text.primary, flex: 1, minWidth: 0 },
  // No rail to hang off, so a bare label centres in the card.
  labelCentre: { textAlign: 'center' },
  glyphWrap: { alignItems: 'center', justifyContent: 'center', minWidth: space[5] },
  glyph: { ...text('h3') },
})
  return { SKINS, styles }
})
