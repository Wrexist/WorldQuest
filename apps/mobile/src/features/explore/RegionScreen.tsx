/**
 * One continent's countries.
 *
 * Not the country detail page (that needs flags, which are sourced and not yet in the
 * bundle) — this is the list, and the list is what a user actually wants here: which
 * of these do I know, and which have I not touched.
 *
 * Sorted by the locale's collator, never `.sort()`. In Swedish, Ängelholm comes after
 * Zimbabwe, and a raw sort puts it between Andorra and Argentina — invisible to
 * everyone except the users it is wrong for.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, ProgressBar, colors, palette, radius, space, text } from '@worldquest/design'
import type { EntityProgress, Mastery } from '@worldquest/engines'
import { collator, currentLocale, useT, type TranslationKey } from '../../lib/i18n.js'
import type { RegionCode } from './ExploreScreen.js'

const MASTERY_LABEL: Record<Mastery, TranslationKey> = {
  unseen: 'explore:mastery.unseen',
  learning: 'explore:mastery.learning',
  familiar: 'explore:mastery.familiar',
  proficient: 'explore:mastery.proficient',
  mastered: 'explore:mastery.mastered',
  burnished: 'explore:mastery.burnished',
}

/** Colour by how well it is known — muted for unseen, reward gold once mastered. */
const MASTERY_COLOR: Record<Mastery, string> = {
  unseen: colors.text.tertiary,
  learning: colors.status.progress,
  familiar: colors.status.progress,
  proficient: colors.feedback.correct,
  mastered: colors.reward.xp,
  burnished: colors.reward.xp,
}

export type CountryRow = {
  readonly id: string
  readonly name: string
  readonly progress: EntityProgress
}

export type RegionScreenProps = {
  readonly region: RegionCode
  readonly regionNameKey: TranslationKey
  readonly countries: readonly CountryRow[]
  readonly onStartLesson: () => void
}

export function RegionScreen({
  region,
  regionNameKey,
  countries,
  onStartLesson,
}: RegionScreenProps) {
  const t = useT()
  const compare = collator(currentLocale()).compare
  const sorted = [...countries].sort((a, b) => compare(a.name, b.name))

  if (sorted.length === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.title} role="heading">
          {t('explore:countries.empty.title')}
        </Text>
        <Text style={styles.subtitle}>{t('explore:countries.empty.body')}</Text>
      </View>
    )
  }

  const learned = sorted.reduce((n, c) => n + c.progress.factsLearned, 0)
  const total = sorted.reduce((n, c) => n + c.progress.factsTotal, 0)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.swatch, { backgroundColor: palette.continent[region] }]} />
        <Text style={styles.title} role="heading">
          {t(regionNameKey)}
        </Text>
      </View>

      <ProgressBar
        current={learned}
        total={Math.max(1, total)}
        label={t('explore:countries.title')}
      />

      <View style={styles.list}>
        {sorted.map(({ id, name, progress }) => (
          <View
            key={id}
            // One element per country: a reader announces "Sweden, Learning, 1 of 2
            // learned" rather than sweeping three separate text nodes.
            accessible
            aria-label={`${name}, ${t(MASTERY_LABEL[progress.mastery])}, ${t(
              'explore:region.progress',
              { learned: progress.factsLearned, total: progress.factsTotal },
            )}`}
            style={styles.row}
          >
            <View style={styles.rowText}>
              <Text style={styles.countryName}>{name}</Text>
              <Text style={styles.countryMeta}>
                {t('explore:region.progress', {
                  learned: progress.factsLearned,
                  total: progress.factsTotal,
                })}
              </Text>
            </View>
            <Text style={[styles.mastery, { color: MASTERY_COLOR[progress.mastery] }]}>
              {t(MASTERY_LABEL[progress.mastery])}
            </Text>
          </View>
        ))}
      </View>

      {/* One primary action per screen. From here, the only thing worth doing is
          learning some of it. */}
      <Button label={t('common:start')} onPress={onStartLesson} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  swatch: { width: 8, height: 32, borderRadius: radius.full },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },

  list: { backgroundColor: colors.bg.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rowText: { flex: 1, gap: space[1] },
  countryName: { ...text('bodyStrong'), color: colors.text.primary },
  countryMeta: { ...text('caption'), color: colors.text.secondary },
  mastery: { ...text('caption', { weight: '600' }) },
})
