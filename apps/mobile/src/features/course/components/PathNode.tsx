/**
 * One step on the course path.
 *
 * ## What each state looks like, and why it is not colour alone
 *
 * - **Current** — the one primary action on Home. Bigger than the rest, the green face on
 *   its darker edge that every primary control here has, the primary's soft halo, and a
 *   callout above it saying Start, the objective and which lesson is next. Pressing it
 *   starts the lesson: no card first, because the one action a new learner is looking
 *   for should be one tap.
 * - **Done** — a tick, in the progress green, on a raised neutral face with a green ring.
 *   Not a green face: six green buttons beside the one that matters would mean none of
 *   them is primary (visual-craft R6). A finished check wears its trophy in gold instead
 *   of the tick, because gold is what this app spends on "you earned this".
 * - **Locked** — the step's own glyph, dimmed, on the plainest face, wearing a lock
 *   badge. Still visible, still announced as what it is, still pressable — a tap opens a
 *   card that says how it opens. No dead taps.
 *
 * The tick, the lock and the size each carry the state on their own, so the path reads
 * the same in greyscale and to someone who cannot tell the green from the slate.
 *
 * ## The press
 *
 * The house mechanic from `press3d`: a face on an edge, and the face sinks flush on
 * press. Only `translateY` moves, on the native driver. A step that changes state gets
 * the celebration pop (`useCelebration`) — the step you finished and the one that opened
 * both spring once — and never on mount, or every visit to Home would bounce.
 */

import { useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import {
  colors,
  depth,
  motion,
  press3d,
  radius,
  space,
  text,
  useCelebration,
  useFacePress,
  useReducedMotion,
} from '@worldquest/design'
import { tContent, useT } from '../../../lib/i18n.js'
import { Icon } from '../../../components/Icon.js'
import type { IconName } from '../../../lib/icons.generated.js'
import type { PathNodeView } from '../pathView.js'
import { PathBubble } from './PathBubble.js'
import {
  BADGE,
  BADGE_GLYPH,
  CURRENT_GLYPH,
  CURRENT_NODE,
  NODE,
  NODE_GLYPH,
  physicalSwing,
} from './pathGeometry.js'

export type PathNodeProps = {
  readonly node: PathNodeView
  /** Steps in the whole course, for "Step 3 of 7". */
  readonly total: number
  /** This step's offset from the column's centre (`swingFor`). */
  readonly swing: number
  /** The path column's width, for the callout's tail. */
  readonly column: number
  /** Whether this step's card is open. Never true for the current step, which has none. */
  readonly expanded: boolean
  readonly onPress: () => void
  /** Where this step sits, for Home's scroll-into-view. */
  readonly onLayout?: ((event: LayoutChangeEvent) => void) | undefined
}

type Skin = { readonly face: string; readonly edge: string; readonly ring: string | null; readonly glyph: string }

const SKINS: Record<PathNodeView['state'], Skin> = {
  current: {
    face: colors.action.primary,
    edge: colors.action.primaryEdge,
    ring: null,
    glyph: colors.text.onAccent,
  },
  done: {
    face: colors.bg.surfaceRaised,
    edge: colors.border.strong,
    ring: colors.status.progress,
    glyph: colors.status.progress,
  },
  locked: {
    face: colors.bg.surface,
    edge: colors.border.subtle,
    // The slate ring is what gives a closed step a boundary at 3:1 against the canvas —
    // without it the dimmed face is navy on navy and the step is not there at all.
    ring: colors.border.strong,
    glyph: colors.text.tertiary,
  },
}

/** A finished check is a trophy in gold — earned — rather than one more tick. */
const DONE_CHECK: Skin = { ...SKINS.done, ring: colors.reward.xp, glyph: colors.reward.xp }

export function PathNode({ node, total, swing, column, expanded, onPress, onLayout }: PathNodeProps) {
  const t = useT()
  const current = node.state === 'current'
  const size = current ? CURRENT_NODE : NODE
  const skin = node.state === 'done' && node.kind === 'check' ? DONE_CHECK : SKINS[node.state]
  const glyph: IconName = node.state === 'done' ? (node.kind === 'check' ? 'trophy' : 'check') : node.icon
  const { translateY, onPressIn, onPressOut } = useFacePress(depth.button)
  const pop = useCelebration(node.state)
  const bob = useBob(current)

  const objective = tContent(node.objectiveKey, { count: node.count })
  // The lesson that comes next, counting from one; a step never reads "Lesson 3 of 2".
  const lesson = Math.min(node.finished + 1, node.lessons)
  const place = { position: node.position, total, objective }
  const label = current
    ? t('home:path.node.current', { ...place, lesson, lessons: node.lessons })
    : node.state === 'done'
      ? t('home:path.node.done', place)
      : t('home:path.node.locked', place)

  // The swing is applied to whatever owns the touch: the circle inside the current step's
  // full-width target, the target itself for every other step. A transform on a child
  // that carries it outside its parent's frame leaves that part of it untappable on iOS,
  // which hit-tests the parent's bounds before it looks at any child.
  const offset = physicalSwing(swing)
  const circle = (
    <Animated.View
      style={[
        press3d.socket,
        styles.socket,
        {
          width: size,
          height: size + depth.button,
          transform: [{ translateX: current ? offset : 0 }, { scale: pop }],
        },
      ]}
    >
      {/* The edge: sized by `top` and the socket's own bottom, as in `Button`, so it is
          exactly the face's circle, `depth.button` lower. */}
      <View style={[press3d.edge, styles.round, { top: depth.button, backgroundColor: skin.edge }]} />
      <Animated.View
        style={[
          styles.round,
          styles.face,
          current && styles.halo,
          {
            width: size,
            height: size,
            backgroundColor: skin.face,
            transform: [{ translateY }],
          },
          skin.ring !== null && { borderWidth: 2, borderColor: skin.ring },
        ]}
      >
        <Icon name={glyph} size={current ? CURRENT_GLYPH : NODE_GLYPH} color={skin.glyph} />
      </Animated.View>
      {node.state === 'locked' && (
        <View style={styles.badge}>
          <Icon name="lock" size={BADGE_GLYPH} color={colors.text.secondary} />
        </View>
      )}
    </Animated.View>
  )

  return (
    <View style={styles.row} onLayout={onLayout}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        role="button"
        aria-label={label}
        // A closed or finished step opens its card; the current one has none to open.
        aria-expanded={current ? undefined : expanded}
        testID={`path-node-${node.state}`}
        style={current ? styles.stretch : { transform: [{ translateX: offset }] }}
      >
        {current && (
          // Stretched, so the callout spans the column and its tail — placed from the
          // column's start edge — lands over the step at every width, not only at 320.
          <Animated.View style={[styles.callout, { transform: [{ translateY: bob }] }]}>
            <PathBubble pointing="down" tailAt={column / 2 + swing} width={column} tone="current">
              <Text style={styles.start}>{t('home:path.start')}</Text>
              <Text style={styles.objective}>{objective}</Text>
              <Text style={styles.lesson}>
                {t('home:path.lesson', { lesson, lessons: node.lessons })}
              </Text>
            </PathBubble>
          </Animated.View>
        )}
        {circle}
      </Pressable>
    </View>
  )
}

/**
 * The callout's attention bob: up a point and back, three times, then still.
 *
 * Bounded on purpose. A loop that never stops is movement a user cannot pause (WCAG
 * 2.2.2), and the tenth bounce is not an invitation, it is noise. Three is enough to be
 * seen arriving. None at all under Reduce Motion — the callout is simply there.
 */
function useBob(active: boolean): Animated.Value {
  const reduced = useReducedMotion()
  const offset = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!active || reduced) {
      offset.setValue(0)
      return
    }
    const half = { duration: motion.base.duration, useNativeDriver: true } as const
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(offset, { ...half, toValue: -space[1] }),
        Animated.timing(offset, { ...half, toValue: 0 }),
      ]),
      { iterations: 3 },
    )
    bounce.start()
    return () => bounce.stop()
  }, [active, reduced, offset])

  return offset
}

const styles = StyleSheet.create({
  row: { alignSelf: 'stretch', alignItems: 'center' },
  // The current step's target spans the column so its callout can; every other step's
  // target is exactly its circle.
  stretch: { alignSelf: 'stretch', alignItems: 'center', gap: space[3] },
  callout: { alignSelf: 'stretch' },
  socket: { alignItems: 'center' },
  round: { borderRadius: radius.full },
  face: { alignItems: 'center', justifyContent: 'center' },
  // The primary's halo, the once-per-screen exception R2 allows — the same values the
  // primary `Button` uses, so the current step and a primary button glow alike.
  halo: {
    shadowColor: colors.action.primaryGlow,
    shadowOpacity: 0.22,
    shadowRadius: space[2],
    shadowOffset: { width: 0, height: space[1] },
    elevation: space[1],
  },
  badge: {
    position: 'absolute',
    end: -space[1],
    bottom: 0,
    width: BADGE,
    height: BADGE,
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sentence case: the iOS pass took the uppercase off every button label, and this is
  // the label of the one primary action on the screen.
  start: { ...text('button'), color: colors.status.progress },
  objective: { ...text('bodyStrong'), color: colors.text.primary },
  lesson: { ...text('caption'), color: colors.text.secondary },
})
