/**
 * One badge, one full screen — the card after the lesson summary.
 *
 * Duolingo's unlock is the badge, large, springing into place; what it is called; and
 * one button. That is the mechanic and all of it is here, with our own medals from
 * `AchievementMedal`. Before this the unlock was a row of 64pt medals under the XP on
 * the summary, which is where a badge goes to be scrolled past.
 *
 * ## What is on it
 *
 * The medal, a "New badge" label, the achievement's name (the heading), its tier in
 * words and in its colour, and the target that tier asked for — "Master the flag of 5
 * countries" — so the card says what was DONE rather than only what it is called. On the
 * last card of a run, "and N more" counts the ones that did not get a card of their own.
 *
 * No reward line. The server pays each tier once, from its own ledger (`balance.ts`); an
 * unlock the device announces again after a reinstall has already been paid, and a
 * "+25 XP" printed over it would be a claim nothing honours. The badge is the reward
 * this screen can promise.
 *
 * ## Motion
 *
 * The medal scales in on `expressive` — a curve with a small overshoot, then settle
 * (`useScaleIn`) — and each new card replays it, because the route keys the card per
 * unlock. Under Reduce Motion the medal is simply there. Continue works from the first
 * frame: the celebration never holds the learner.
 */

import { useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  Button,
  colors,
  radius,
  space,
  Spacer,
  squircle,
  text,
  useScaleIn,
} from '@worldquest/design'
import { tContent, useT } from '../../lib/i18n.js'
import { AchievementMedal } from './AchievementMedal.js'
import type { PendingUnlock } from './pending.js'
import { TIER_COLOR, TIER_LABEL } from './tiers.js'
import { thresholdOf } from './unlockParams.js'
import { achievementDescKey, achievementNameKey } from './useAchievements.js'

export type AchievementUnlockedProps = {
  readonly unlock: PendingUnlock
  /** Unlocks past the last card, counted on it. Zero on every other card. */
  readonly more?: number
  readonly onContinue: () => void
}

/**
 * The medal owns the top of the screen, the way the flame does on the streak beat.
 *
 * Smaller on a short phone or at large text: at 320 × 568 with doubled text the full
 * size left the name as the last thing above the pinned Continue, with its tier and
 * what it took below the fold.
 */
const MEDAL = 168
const MEDAL_COMPACT = 120

/** Below this the medal shrinks: the same line `LessonScreen` draws for a short phone. */
const SHORT_SCREEN = 700
/** At or above this OS text scale, likewise. */
const LARGE_TEXT = 1.5

export function AchievementUnlocked({ unlock, more = 0, onContinue }: AchievementUnlockedProps) {
  const t = useT()
  const medal = useScaleIn(0.5)
  const { height, fontScale } = useWindowDimensions()
  const medalSize = height < SHORT_SCREEN || fontScale >= LARGE_TEXT ? MEDAL_COMPACT : MEDAL

  /**
   * Screen-reader focus to the badge's name as each card arrives.
   *
   * Continue is pressed and the next card replaces this one, so the button under the
   * cursor unmounts and VoiceOver's focus falls wherever the platform puts it — the next
   * badge would never be read. The lesson's verdict sheet solved the same problem the
   * same way. Native only: react-native-web implements neither half of this.
   */
  const heading = useRef<Text>(null)
  useEffect(() => {
    if (Platform.OS === 'web' || heading.current === null) return
    AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus')
  }, [])

  const threshold = thresholdOf(unlock)

  return (
    <View style={styles.screen} testID="achievement-unlocked">
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Spacer />
        {/* Decorative: the medal is hidden from the reader inside `AchievementMedal`,
            and the heading below names it. */}
        <Animated.View style={[styles.hero, medal]} pointerEvents="none">
          <AchievementMedal achievementId={unlock.achievementId} tier={unlock.tier} size={medalSize} />
        </Animated.View>

        <Text style={styles.label}>{t('achievements:unlocked.label')}</Text>
        <Text ref={heading} style={styles.name} role="heading" aria-level={1}>
          {tContent(achievementNameKey(unlock.achievementId))}
        </Text>
        {/* The tier in WORDS, with its colour as the second signal — never the colour
            alone, which is a guess for anybody who cannot tell bronze from gold. */}
        <View style={[styles.tier, { borderColor: TIER_COLOR[unlock.tier] }]}>
          <Text style={[styles.tierText, { color: TIER_COLOR[unlock.tier] }]}>
            {t(TIER_LABEL[unlock.tier])}
          </Text>
        </View>
        {threshold !== undefined && (
          <Text style={styles.desc}>
            {tContent(achievementDescKey(unlock.achievementId), { threshold })}
          </Text>
        )}
        {more > 0 && (
          <Text style={styles.more} testID="achievement-more">
            {t('achievements:unlocked.more', { count: more })}
          </Text>
        )}
        <Spacer />
      </ScrollView>

      <View style={styles.actions}>
        <Button label={t('common:continue')} onPress={onContinue} testID="achievement-continue" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[5],
    paddingTop: space[5],
  },
  hero: { alignItems: 'center', justifyContent: 'center', marginBottom: space[2] },
  // Gold because it is the one thing gold means here: you earned this.
  label: { ...text('overline'), color: colors.reward.coin, textAlign: 'center' },
  name: { ...text('display'), color: colors.text.primary, textAlign: 'center' },
  // A label, not a control: a ring and no edge, so it cannot be mistaken for a button.
  tier: {
    borderWidth: 2,
    borderRadius: radius.full,
    ...squircle,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
  tierText: text('bodyStrong'),
  desc: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  more: { ...text('bodyStrong'), color: colors.text.primary, textAlign: 'center', marginTop: space[2] },
  actions: { padding: space[4], gap: space[2] },
})
