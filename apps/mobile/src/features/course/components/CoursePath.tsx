/**
 * The course path — Home's primary action, as a trail you can see.
 *
 * ## The graft
 *
 * Duolingo's iOS home is its path, and three mechanics make it feel like a trail rather
 * than a list (the whole account, with what was refused, is in
 * `.claude/skills/dna-transplant/references/duolingo-worldquest.md`, graft six):
 *
 * 1. **One lit step on a winding line.** Position is the sequence: steps zig-zag down
 *    the column, the one you are on is bigger, lit and labelled Start, what is behind
 *    you is ticked, what is ahead is visible and dimmed.
 * 2. **Every step answers a tap.** The current one starts; a done one opens a card with
 *    Practise; a closed one opens a card saying how it opens. Nothing is a dead tap.
 * 3. **A banner per unit** says where you are: the unit, its objective, a count.
 *
 * ## Order is path order, for everyone
 *
 * Units, then their steps, then any open card right after the step it belongs to — so a
 * screen reader and a keyboard walk the path in the order a finger does, and each step's
 * label says its state ("Step 3 of 7, not open yet. …").
 *
 * ## States
 *
 * Content is the path. The finished course is the path plus a card offering review —
 * never a fake next step (L15). An unreadable pack is the error card, which still leads
 * somewhere: lessons do not depend on the course. Loading is `CoursePathSkeleton`, drawn
 * by Home's skeleton; the path itself is synchronous and has no wait of its own.
 */

import { Fragment, useCallback, useRef, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { Button, Card, colors, space, text } from '@worldquest/design'
import { tContent, useT } from '../../../lib/i18n.js'
import { Art } from '../../../components/Art.js'
import type { CoursePathView, PathNodeView } from '../pathView.js'
import { PathBubble } from './PathBubble.js'
import { PathNode } from './PathNode.js'
import { UnitHeader } from './UnitHeader.js'
import { estimatedColumn, swingFor } from './pathGeometry.js'

/** Atlas on the finished-course card: he is the celebration, so he is the size of one. */
const COMPLETE_ART = 112

export type CoursePathProps = {
  readonly path: CoursePathView
  /** The current step's lesson. */
  readonly onStart: (nodeId: string) => void
  /** A finished step's lesson again. */
  readonly onPractise: (nodeId: string) => void
  /** The finished course's review. */
  readonly onReview: () => void
  /** An ordinary lesson, when the course could not be read. */
  readonly onPractiseAnyway: () => void
  /**
   * Where the one recommended thing — the current step, or the finished-course card —
   * sits inside the path, once laid out. Home owns the scroll view and brings it into
   * view; this component cannot, and should not know it is in one.
   */
  readonly onCurrentLayout?: ((y: number, height: number) => void) | undefined
}

export function CoursePath({
  path,
  onStart,
  onPractise,
  onReview,
  onPractiseAnyway,
  onCurrentLayout,
}: CoursePathProps) {
  const t = useT()
  // One card open at a time, as the donor's popovers: opening another closes this one.
  const [open, setOpen] = useState<string | null>(null)
  // Home's content width until the path has measured itself (`estimatedColumn`).
  const { width } = useWindowDimensions()
  const [measured, setMeasured] = useState<number | null>(null)
  const column = measured ?? estimatedColumn(width)

  // The current step's position is its unit's offset plus its own, and the two layouts
  // arrive in no guaranteed order — so both handlers report, and whichever lands second
  // completes the sum.
  const unitTop = useRef(new Map<string, number>())
  const current = useRef<{ unitId: string; y: number; height: number } | null>(null)
  const report = useCallback(() => {
    const at = current.current
    if (at === null || onCurrentLayout === undefined) return
    const top = unitTop.current.get(at.unitId)
    if (top !== undefined) onCurrentLayout(top + at.y, at.height)
  }, [onCurrentLayout])

  if (path.status === 'error') {
    return (
      <Card level={2} style={styles.card} testID="path-error">
        <Text style={styles.cardTitle} role="heading">
          {t('home:path.error.title')}
        </Text>
        <Text style={styles.cardBody}>{t('home:path.error.body')}</Text>
        <Button label={t('home:path.error.cta')} onPress={onPractiseAnyway} />
      </Card>
    )
  }

  const pressed = (node: PathNodeView) => () => {
    if (node.state === 'current') {
      setOpen(null)
      onStart(node.id)
      return
    }
    setOpen((was) => (was === node.id ? null : node.id))
  }

  return (
    <View
      style={styles.path}
      onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
    >
      {path.units.map((unit) => (
        <View
          key={unit.id}
          style={styles.unit}
          onLayout={(event: LayoutChangeEvent) => {
            unitTop.current.set(unit.id, event.nativeEvent.layout.y)
            report()
          }}
        >
          <UnitHeader unit={unit} withAtlas={unit.state === 'current'} />
          {unit.nodes.map((node, index) => {
            const swing = swingFor(index, column)
            const expanded = open === node.id
            return (
              <Fragment key={node.id}>
                <PathNode
                  node={node}
                  total={path.total}
                  swing={swing}
                  column={column}
                  expanded={expanded}
                  onPress={pressed(node)}
                  onLayout={
                    node.state === 'current'
                      ? (event: LayoutChangeEvent) => {
                          const { y, height } = event.nativeEvent.layout
                          current.current = { unitId: unit.id, y, height }
                          report()
                        }
                      : undefined
                  }
                />
                {expanded && (
                  <PathBubble
                    pointing="up"
                    tailAt={column / 2 + swing}
                    width={column}
                    tone="quiet"
                    testID="path-card"
                  >
                    <Text style={styles.bubbleTitle}>{tContent(node.objectiveKey, { count: node.count })}</Text>
                    <Text style={styles.bubbleBody}>
                      {node.state === 'done' ? t('home:path.done.body') : t('home:path.locked.body')}
                    </Text>
                    {node.state === 'done' && (
                      // Blue, not green: practice is a way back, and the one green on this
                      // screen belongs to the step you are on.
                      <Button
                        label={t('home:path.practise')}
                        variant="secondary"
                        size="md"
                        onPress={() => {
                          setOpen(null)
                          onPractise(node.id)
                        }}
                        testID="path-practise"
                        style={styles.practise}
                      />
                    )}
                  </PathBubble>
                )}
              </Fragment>
            )
          })}
        </View>
      ))}

      {path.complete && (
        // Measured from a wrapper because `Card` takes no layout handler, and the card is
        // the recommendation once the path is walked: its y is already the path's.
        <View
          onLayout={(event: LayoutChangeEvent) => {
            const { y, height } = event.nativeEvent.layout
            onCurrentLayout?.(y, height)
          }}
        >
          <Card level={2} style={styles.card} testID="path-complete">
            <View style={styles.completeBody}>
              {/* Decorative: the heading says what happened. */}
              <View pointerEvents="none" aria-hidden>
                <Art name="atlas/celebrate" size={COMPLETE_ART} />
              </View>
              <View style={styles.completeWords}>
                <Text style={styles.cardTitle} role="heading">
                  {t('home:path.complete.title', { course: tContent(path.titleKey) })}
                </Text>
                <Text style={styles.cardBody}>{t('home:path.complete.body')}</Text>
              </View>
            </View>
            <Button label={t('home:path.review')} onPress={onReview} testID="path-review" />
          </Card>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  path: { gap: space[5] },
  // Related things close: a unit's steps sit a card-gap apart, and units a section apart.
  unit: { gap: space[3] },
  card: { gap: space[3] },
  cardTitle: { ...text('h3'), color: colors.text.primary },
  cardBody: { ...text('body'), color: colors.text.secondary },
  bubbleTitle: { ...text('bodyStrong'), color: colors.text.primary },
  bubbleBody: { ...text('caption'), color: colors.text.secondary },
  practise: { marginTop: space[2] },
  completeBody: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  completeWords: { flex: 1, gap: space[1] },
})
