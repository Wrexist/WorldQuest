import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, radius, space, text } from '@worldquest/design'
import { DaylightIllustration } from '../../components/DaylightIllustration.js'
import { currentLocale, formatDate, useT } from '../../lib/i18n.js'

const PAGE_SIZE = 7

export function StreakGemCollection({ days, onOpenChest }: {
  readonly days: readonly string[]
  readonly onOpenChest?: (() => void) | undefined
}) {
  const t = useT()
  const [page, setPage] = useState(0)
  const lastPage = Math.max(0, Math.ceil(days.length / PAGE_SIZE) - 1)
  const shownPage = Math.min(page, lastPage)
  const start = shownPage * PAGE_SIZE
  const shown = [...days].reverse().slice(start, start + PAGE_SIZE)
  return <Card style={styles.card} testID="streak-gem-collection">
    <Text style={styles.title} role="heading">{t('streak:collection.title')}</Text>
    <Text style={styles.count}>{t('streak:collection.count', { count: days.length })}</Text>
    {days.length > 0 && <View style={styles.gems}>
      {shown.map(day => {
        // Noon preserves the local calendar date across timezone offsets and DST.
        const date = formatDate(new Date(`${day}T12:00:00`), currentLocale())
        return <View key={day} accessible testID="collected-streak-gem"
          accessibilityLabel={t('streak:collection.badge', { date })} style={styles.badge}>
          <DaylightIllustration name="gem" size={space[7]} active={false} />
          <Text style={styles.date}>{date}</Text>
        </View>
      })}
    </View>}
    {days.length > PAGE_SIZE && <>
      <Text style={styles.date} role="status" aria-live="polite">
        {t('streak:collection.page', { first: start + 1, last: Math.min(start + PAGE_SIZE, days.length), total: days.length })}
      </Text>
      <View style={styles.paging}>
        <View style={styles.pageButton}><Button variant="tertiary" label={t('streak:collection.newer')}
          disabled={shownPage === 0} onPress={() => setPage(shownPage - 1)} /></View>
        <View style={styles.pageButton}><Button variant="tertiary" label={t('streak:collection.older')}
          disabled={shownPage === lastPage} onPress={() => setPage(shownPage + 1)} /></View>
      </View>
    </>}
    <Text style={styles.body}>{t(days.length > 0 ? 'streak:collection.body' : 'streak:collection.empty')}</Text>
    <Text style={styles.date}>{t('streak:collection.device')}</Text>
    {onOpenChest !== undefined && <Button label={t('streak:collection.open')} variant="secondary" onPress={onOpenChest} />}
  </Card>
}

const styles = StyleSheet.create({
  card: { gap: space[3] },
  title: { ...text('h2'), color: colors.text.primary },
  count: { ...text('bodyStrong'), color: colors.text.primary },
  body: { ...text('body'), color: colors.text.secondary },
  gems: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  badge: { alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: colors.bg.surfaceRaised },
  paging: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  pageButton: { flexGrow: 1 },
  date: { ...text('caption'), color: colors.text.secondary },
})
