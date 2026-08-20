/**
 * Seven bars, one per day — the shape of the user's week.
 *
 * ## Why it is a component now
 *
 * It lived inside `ProfileScreen` as a local function, and the streak screen — the page
 * whose entire subject is consecutive days — had no calendar at all. The Profile tab that
 * links to it showed more about the streak than the streak page did, and the numbers said
 * so: after a real lesson, Profile goes from 40 % ink to 86 % while Streak moves two
 * points, 68 % to 70 %. A user with a streak sees very nearly the screen a user with none
 * does.
 *
 * The fix is not a second week strip. Two implementations of "which days did I learn on"
 * is two things that can disagree about the same fact, which is the class of bug this
 * repo keeps finding — the two progress indicators in onboarding, the two week counts, a
 * badge that pays twice. One component, two callers.
 *
 * ## Heights are relative to the user's own best day
 *
 * Not to a goal. A chart scaled to a target makes a five-lesson day look like a failure
 * next to a ten-lesson one; scaled to the week, it shows the shape of the week, which is
 * the only thing seven bars can honestly say.
 */

import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, space, squircle, text } from '@worldquest/design'
import { useT } from '../lib/i18n.js'

export type WeekActivity = readonly { readonly day: string; readonly count: number }[]

export type WeekStripProps = {
  readonly week: WeekActivity
  /**
   * Shown instead of the bars when nothing happened all week.
   *
   * Profile says "Nothing this week yet"; the streak screen says nothing at all, because
   * the heading directly above it already reads "No days yet" and a second sentence
   * saying the same thing is the third statement of one nothing.
   */
  readonly emptyLabel?: string | undefined
}

/** Tall enough for the ratio between a one-lesson day and a ten-lesson one to read. */
const STRIP_HEIGHT = 96

/**
 * The floor under a day that had ANY activity.
 *
 * A 1-lesson day beside a 12-lesson one rounds to an invisible sliver, which reads as
 * "you did nothing" — the opposite of the truth, on the screen least able to afford
 * saying it.
 */
const MIN_BAR_PERCENT = 12

export function WeekStrip({ week, emptyLabel }: WeekStripProps) {
  const t = useT()
  const peak = Math.max(0, ...week.map((d) => d.count))

  if (peak === 0) {
    return emptyLabel === undefined ? null : <Text style={styles.empty}>{emptyLabel}</Text>
  }

  return (
    <View style={styles.week}>
      {week.map((day, index) => (
        <View
          /* The INDEX, not the day name.
             `useWeekActivity` labels days with `weekday: 'narrow'`, which in English is
             M T W T F S S — two Ts and two Ss. Keying on that gave React duplicate keys
             in a seven-item list, which is undefined behaviour: it may reuse the wrong
             node across a re-render, so a bar animates into the wrong column. Inherited
             from the version of this that lived in `ProfileScreen`, and only visible once
             a test rendered it outside a screen.
             The index is the right key here and not a shrug: this is a fixed-length
             window of the last seven days in fixed order, never sorted, never filtered. */
          key={index}
          accessible
          accessibilityLabel={t('profile:week.day', { day: day.day, count: day.count })}
          style={styles.day}
        >
          <View style={styles.track}>
            <View
              style={[
                styles.bar,
                { height: `${day.count === 0 ? 0 : Math.max(MIN_BAR_PERCENT, (day.count / peak) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.label}>{day.day}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2], height: STRIP_HEIGHT },
  day: { flex: 1, alignItems: 'center', gap: space[1] },
  /**
   * The track is DRAWN, not just reserved.
   *
   * It had no background once, so a day with no lessons rendered nothing at all — and the
   * rendered week came out as a single green rectangle floating beside six invisible
   * columns. A chart of "days with activity" that hides the days without any flatters the
   * user by lying about the shape of their week, and the empty channel is what makes the
   * shape true.
   *
   * `progressTrack` rather than a surface, and that is the point of using it: it is the
   * same unfilled channel `ProgressBar` draws everywhere else in the app, so an empty day
   * here reads as the same "nothing yet" an empty bar does on Explore.
   */
  track: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    borderRadius: radius.sm,
    ...squircle,
    backgroundColor: colors.status.progressTrack,
    overflow: 'hidden',
  },
  bar: { width: '100%', borderRadius: radius.sm, backgroundColor: colors.status.progress, ...squircle },
  label: { ...text('overline'), color: colors.text.tertiary },
  empty: { ...text('body'), color: colors.text.secondary },
})
