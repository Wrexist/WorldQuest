/**
 * This month, one cell a day: the streak screen's calendar.
 *
 * Duolingo's streak page is a month of days with the learned ones filled in, and a run
 * of them joined into one shape, so the streak is drawn as what it is: consecutive days.
 * This is that in our colours. A day with a finished lesson is flame, and a run of them
 * inside a week row is one pill, so a streak reads as a streak and a scattered month
 * reads as scattered.
 *
 * ## What it does not say
 *
 * No freeze days. The log this reads is the device's own record of finished lessons;
 * which days a freeze covered is the server's to know, and a calendar that guessed would
 * be drawing a fact it does not have.
 *
 * Nothing on a missed day. An empty cell is the absence of a lesson, not a mark against
 * anyone, so there is no red and no cross. Today gets a ring, which is orientation.
 *
 * ## For a screen reader
 *
 * Thirty cells read one by one is a minute of numbers. The month's name and the count
 * beside it say what the grid shows ("September 2026", "12 days this month"), and the
 * grid itself is hidden.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Card, colors, radius, space, text } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import type { MonthActivity } from './monthActivity.js'

/**
 * The height of a day. Wide enough for "30" at 200 % text in a seventh of a 320pt
 * card, and it is a minimum: at larger sizes the row grows rather than clipping.
 */
const DAY_HEIGHT = 32

/** The ring around today: the width `AchievementUnlocked` gives its medal's ring. */
const TODAY_RING = 2

export function MonthCalendar({ month }: { month: MonthActivity }) {
  const t = useT()

  return (
    <Card level={1} style={styles.card} testID="streak-calendar">
      <View style={styles.header}>
        <Text style={styles.title} role="heading" aria-level={2}>
          {month.title}
        </Text>
        {/* Silent at zero, like `streak:longest`: the screen's heading already says
            "No days yet", and a count reporting nothing would be the third time. */}
        {month.learnedDays > 0 && (
          <Text style={styles.count}>
            {t('streak:calendar.count', { count: month.learnedDays })}
          </Text>
        )}
      </View>

      <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.grid}>
        <View style={styles.row}>
          {month.weekdays.map((name, column) => (
            // The column, not the name: narrow names repeat (two T and two S in English).
            <Text key={column} style={styles.weekday}>
              {name}
            </Text>
          ))}
        </View>
        {month.weeks.map((week, row) => (
          <View key={row} style={styles.row}>
            {week.map((cell, column) => {
              if (cell === null) return <View key={column} style={styles.cell} />
              const learned = cell.count > 0
              // Joined to a learned neighbour in the same row, so a run is one pill.
              // A run that wraps onto the next week starts a new pill there, as a
              // printed calendar would draw it.
              const joinsBefore = learned && (week[column - 1]?.count ?? 0) > 0
              const joinsAfter = learned && (week[column + 1]?.count ?? 0) > 0
              return (
                <View key={column} style={styles.cell}>
                  <View
                    testID={learned ? 'calendar-day-learned' : undefined}
                    style={[
                      styles.day,
                      learned && styles.learned,
                      joinsBefore && styles.joinsBefore,
                      joinsAfter && styles.joinsAfter,
                      cell.isToday && !learned && styles.today,
                    ]}
                  >
                    <Text
                      style={[
                        styles.number,
                        learned && styles.numberLearned,
                        cell.isToday && !learned && styles.numberToday,
                      ]}
                    >
                      {cell.dayOfMonth}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        ))}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space[2],
  },
  title: { ...text('h3'), color: colors.text.primary },
  count: { ...text('caption', { weight: '700', numeric: true }), color: colors.status.streak },
  grid: { gap: space[1] },
  row: { flexDirection: 'row' },
  // `text.secondary`, not `tertiary`: tertiary is a large-text token and these are 12pt.
  weekday: { ...text('overline'), flex: 1, color: colors.text.secondary, textAlign: 'center' },
  cell: { flex: 1 },
  day: {
    minHeight: DAY_HEIGHT,
    marginHorizontal: space[1],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  learned: { backgroundColor: colors.status.streak },
  // The margin goes too, or a run would be beads with gaps rather than one shape.
  // Logical sides, so in a right-to-left calendar the day before is joined on the
  // right, where it is drawn.
  joinsBefore: { marginStart: 0, borderTopStartRadius: 0, borderBottomStartRadius: 0 },
  joinsAfter: { marginEnd: 0, borderTopEndRadius: 0, borderBottomEndRadius: 0 },
  today: { borderWidth: TODAY_RING, borderColor: colors.status.streak },
  number: { ...text('caption', { numeric: true }), color: colors.text.secondary },
  numberLearned: { ...text('caption', { weight: '800', numeric: true }), color: colors.text.onStreak },
  numberToday: { ...text('caption', { weight: '800', numeric: true }), color: colors.text.primary },
})
