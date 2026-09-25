/**
 * The streak just grew — the beat after the day's first finished lesson.
 *
 * Duolingo's version is the flame that swells, the number that ticks up, and the week
 * that fills in one more day. Those three are the mechanic, and all three are here with
 * WorldQuest's own flame and copy. What is NOT here is the other half of theirs: no
 * "don't break it tomorrow", no countdown, no friend to beat. The screen is about what
 * the learner did today, and it ends on one button that says so (rule 7).
 *
 * Presentational: the route reads the streak, the week and the milestone, and decides
 * where "Continue" goes. Mountable by a test and the screenshot harness with no store.
 *
 * ## Motion
 *
 * The flame scales in on `celebrate` and the count runs from yesterday's number to
 * today's with `useCountUp`. Both collapse to their end state under Reduce Motion, so
 * the celebration still lands — it just does not travel. Nothing blocks the button.
 */

import { Animated, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { Button, colors, space, text, useAnimatedTo, useCountUp } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { WeekStrip, type WeekActivity } from '../../components/WeekStrip.js'

export type StreakExtendedProps = {
  /** The streak after today's lesson. Always at least 1 when this screen draws. */
  readonly streak: number
  readonly week: WeekActivity
  /** XP paid for hitting a 7/30/100/365 milestone today; absent on every other day. */
  readonly milestoneXp?: number | undefined
  readonly onContinue: () => void
}

/**
 * The flame, sized to own the top half of a 320-wide phone without crowding it.
 *
 * No `celebration/rays` behind it: that asset is a white starburst drawn for light
 * cards, and on the navy background it rendered as a glaring square that competed
 * with the flame's own glow. The flame carries its light with it.
 */
const FLAME = 168

export function StreakExtended({ streak, week, milestoneXp, onContinue }: StreakExtendedProps) {
  const t = useT()
  const [landed, setLanded] = useState(false)
  useEffect(() => setLanded(true), [])
  const arrival = useAnimatedTo(landed ? 1 : 0, 'celebrate')
  const shown = useCountUp(landed ? streak : Math.max(0, streak - 1))

  const flame = {
    transform: [{ scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
  }

  return (
    <View style={styles.screen} testID="streak-extended">
      <View style={styles.body}>
        <View style={styles.hero} pointerEvents="none">
          <Animated.View style={[flame, { opacity: arrival }]}>
            <Art name="rewards/streak-flame" size={FLAME} />
          </Animated.View>
        </View>

        {/* The count is the headline. Screen readers get the settled number once, not
            every frame of the tick-up. */}
        <Text
          style={styles.count}
          role="heading"
          accessibilityLabel={t('streak:extended.count', { count: streak })}
        >
          {String(Math.round(shown))}
        </Text>
        <Text style={styles.title} accessibilityElementsHidden importantForAccessibility="no">
          {t('streak:extended.unit', { count: streak })}
        </Text>
        <Text style={styles.body1}>
          {streak === 1 ? t('streak:extended.first') : t('streak:extended.body')}
        </Text>

        {milestoneXp !== undefined && (
          <Text style={styles.milestone}>{t('streak:extended.milestone', { count: streak, amount: milestoneXp })}</Text>
        )}

        <View style={styles.week}>
          <WeekStrip week={week} />
        </View>
      </View>

      <View style={styles.actions}>
        <Button label={t('streak:extended.cta')} onPress={onContinue} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[5],
  },
  hero: { width: FLAME, height: FLAME, alignItems: 'center', justifyContent: 'center' },
  // The number is the headline, as large as the type scale goes.
  count: { ...text('hero'), color: colors.status.streak, textAlign: 'center' },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  body1: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  milestone: { ...text('bodyStrong', { numeric: true }), color: colors.reward.xp, textAlign: 'center' },
  week: { alignSelf: 'stretch', marginTop: space[4] },
  actions: { padding: space[4], gap: space[2] },
})
