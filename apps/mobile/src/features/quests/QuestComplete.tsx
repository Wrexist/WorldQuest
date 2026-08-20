/**
 * The quest is finished — mockup screen 8.
 *
 * ## The moment this exists for
 *
 * Finishing the daily quest is the ritual the whole product turns on, and until now it
 * happened in silence: the fifth task ticked, `quest_completed` was tracked, an
 * achievement counter moved, and the user saw a button on Home change from "Continue" to
 * "Practise anyway". The engine has known when a quest finishes since it was built. This
 * is the first thing that tells the person who finished it.
 *
 * It is deliberately AFTER the lesson summary rather than instead of it. The summary is
 * about the lesson — what you got right, what you earned for it — and this is about the
 * day. Collapsing them would make the quest bonus look like part of the lesson's XP, and
 * the whole point of a daily quest is that it is a second, larger thing.
 *
 * ## What is real on it
 *
 * Every number here is read, not typed:
 *
 * · the score is tasks done over tasks set, and it is drawn only when those two agree —
 *   a router can point at this screen, and "0 of 5 done" under "Quest complete" is a
 *   screen arguing with itself;
 * · the two rewards are `BALANCE.xp.dailyQuest` and `BALANCE.coins.dailyQuest`, the
 *   figures the server actually awards for the bonus;
 * · the streak is the streak.
 *
 * The reference draws a third reward chip paying gems and a "Streak bonus +2". Neither
 * exists: gems are purchase-only by design (`xp-economy.md` §4) and there is no per-day
 * streak bonus in the balance table — `streakMilestones` pays at 7, 30, 100 and 365 days
 * and nothing in between. So the streak appears as what it is, a count that just went up,
 * and the milestone line appears only on a day that actually hits one.
 *
 * ## "Claim rewards" is a button that does not exist here
 *
 * The reference ends on one. The server awards the bonus while grading the lesson that
 * finished the quest (ADR 0006), from the pinned quest and its own `review_log` — so
 * there is nothing here for a button to claim. A button that claims something you have
 * been given is the dead-shell pattern this repo has removed twice; the action here is
 * to leave, and it says so.
 *
 * That paragraph used to say the XP and coins were "already granted" and it was not
 * true: nothing anywhere paid a quest, and this screen drew a "+50 XP" tile above a
 * comment asserting it had landed. It is true now, with one honest qualification — a
 * quest finished offline is paid when the sync queue drains, which is the same ordering
 * the lesson's own XP has always had.
 *
 * ## Motion
 *
 * The burst scales in and settles; nothing fades in place, and nothing blocks the button
 * (`apps/mobile/CLAUDE.md`). `useAnimatedTo` collapses to an instant set under reduced
 * motion, so the celebration still LANDS — it just does not travel.
 */

import { Animated, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  Card,
  colors,
  radius,
  space,
  squircle,
  text,
  useAnimatedTo,
} from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { useEffect, useState } from 'react'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import { Stat } from '../../components/Stat.js'

export type QuestCompleteProps = {
  /** Tasks finished, and tasks set. 5 of 5 whenever this screen is reachable. */
  readonly done: number
  readonly total: number
  /** The streak after today's lesson. Absent hides the line rather than showing zero. */
  readonly streak?: number | undefined
  /**
   * The streak milestone this day hit, if it hit one.
   *
   * `BALANCE.xp.streakMilestones` pays at 7, 30, 100 and 365 days. On every other day
   * there is no bonus, and inventing a "+2" for the other 361 would be a reward number
   * that exists only on this screen.
   */
  readonly milestoneXp?: number | undefined
  readonly onDone: () => void
}

/**
 * The hero.
 *
 * The reference draws a gold trophy on a laurel plinth with the score lettered onto a
 * ribbon. There is no trophy master, and a lettered one would be worse than none: a baked
 * "100 %" is a picture that lies to anyone who scored eighty. `celebration/burst` is the
 * asset this app already celebrates with, and the score is live text under it.
 */
const HERO = 200

/**
 * Atlas, inside the burst.
 *
 * `celebration/burst` is a RING — a confetti wreath with a hole in the middle, drawn to
 * frame something. Rendered on its own it is a doughnut, which is what the first shot of
 * this screen was. The thing it frames is the mascot, celebrating, which is the pose the
 * lesson summary already uses for the same feeling.
 *
 * 0.42 of the ring, measured off the shot: large enough to fill the hole, small enough
 * that the confetti still reads as confetti around him rather than as a border.
 */
const HERO_SUBJECT = 0.42

export function QuestComplete({ done, total, streak, milestoneXp, onDone }: QuestCompleteProps) {
  const t = useT()

  // One frame late on purpose, so the animation has a "from" to travel out of. A value
  // that starts at its destination is a value that never moves.
  const [landed, setLanded] = useState(false)
  useEffect(() => setLanded(true), [])
  const arrival = useAnimatedTo(landed ? 1 : 0, 'celebrate')
  const burst = {
    opacity: arrival,
    transform: [{ scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
  }

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <Animated.View style={[styles.hero, burst]} pointerEvents="none">
          <Art name="celebration/burst" size={HERO} />
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.heroSubject}>
              <Art name="atlas/celebrate" size={Math.round(HERO * HERO_SUBJECT)} />
            </View>
          </View>
        </Animated.View>

        <Text style={styles.title} role="heading">
          {t('quests:done.title')}
        </Text>
        <Text style={styles.subtitle}>{t('quests:done.body')}</Text>

        {/* The score, as a number rather than as a ribbon. `done / total` and not a
            percentage: the tasks are what the user just did, and "5 of 5" is the
            sentence the Quests tab has been showing them all day.
   
            Only when it agrees with the headline. This screen is reachable only because a
            quest finished, but it is reachable by a router and a router can be pointed at
            it — and the first render of it printed "0 of 5 done" directly under "Quest
            complete", which is a screen arguing with itself. Absent beats contradictory. */}
        {total > 0 && done >= total && (
          <Text style={styles.score}>{t('quests:progress', { done, total })}</Text>
        )}

        <View style={styles.rewards}>
          <Reward
            kind="xp"
            amount={BALANCE.xp.dailyQuest}
            label={t('quests:done.reward.xp', { amount: BALANCE.xp.dailyQuest })}
          />
          <Reward
            kind="coin"
            amount={BALANCE.coins.dailyQuest}
            label={t('quests:done.reward.coins', { amount: BALANCE.coins.dailyQuest })}
          />
        </View>

        {/* The streak, on the one screen a day where saying it is a reward rather than
            a scoreboard. Silent at zero, like everywhere else this number appears. */}
        {streak !== undefined && streak > 0 && (
          <View style={styles.streak}>
            <Icon name="streak" size={18} color={colors.status.streak} />
            <Text style={styles.streakText}>{t('quests:done.streak', { count: streak })}</Text>
          </View>
        )}

        {/* Only on a day that actually hits a milestone — 7, 30, 100, 365. */}
        {milestoneXp !== undefined && (
          <Text style={styles.milestone}>{t('quests:done.milestone', { amount: milestoneXp })}</Text>
        )}
      </View>

      <View style={styles.actions}>
        {/* Not "Claim". Nothing is withheld — see the header. */}
        <Button label={t('quests:done.cta')} onPress={onDone} />
      </View>
    </View>
  )
}

/** One reward tile. The same shape the quest's cover page offers them in. */
function Reward({
  kind,
  amount,
  label,
}: {
  readonly kind: 'xp' | 'coin'
  readonly amount: number
  readonly label: string
}) {
  return (
    <Card level={2} style={styles.reward} accessibilityLabel={label}>
      {/* Named by the card, so the pill inside it is silent. */}
      <Stat kind={kind} value={`+${amount}`} accessibilityLabel="" />
    </Card>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    paddingHorizontal: space[5],
  },
  hero: { alignItems: 'center', justifyContent: 'center' },
  heroSubject: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { ...text('display'), color: colors.text.primary, textAlign: 'center' },
  subtitle: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  score: { ...text('h2', { numeric: true }), color: colors.status.progress },
  rewards: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
  reward: {
    alignItems: 'center',
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    ...squircle,
  },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  streakText: { ...text('bodyStrong', { numeric: true }), color: colors.text.primary },
  milestone: { ...text('caption', { numeric: true }), color: colors.reward.xp },
  actions: { padding: space[4], gap: space[2] },
})
