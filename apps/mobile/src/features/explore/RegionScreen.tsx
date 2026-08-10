/**
 * One continent's countries.
 *
 * Not the country detail page — this is the list, and the list is what a user actually
 * wants here: which of these do I know, and which have I not touched.
 *
 * It carried a note saying flags were "sourced and not yet in the bundle", and that
 * stopped being true when `pnpm build:flags` landed and the collection grid started
 * drawing them at 72pt. So nineteen European countries were rendering as plain text
 * rows, in a geography app that ships 65 rasterised flags, on the strength of a comment
 * describing a constraint that had been lifted. A stale reason reads exactly like a live
 * one, which is the whole hazard of writing them down.
 *
 * Sorted by the locale's collator, never `.sort()`. In Swedish, Ängelholm comes after
 * Zimbabwe, and a raw sort puts it between Andorra and Argentina — invisible to
 * everyone except the users it is wrong for.
 */

import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  ArtScrim,
  Button,
  colors,
  palette,
  ProgressBar,
  radius,
  space,
  squircle,
  Tally,
  text,
} from '@worldquest/design'
import type { EntityProgress, Mastery, RegionProgress } from '@worldquest/engines'
import { collator, currentLocale, useT, type TranslationKey } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { Flag } from '../../components/Flag.js'
import {
  CONTINENT_ART,
  CONTINENT_SILHOUETTE,
  continentArtSize,
  type RegionCode,
} from './ExploreScreen.js'

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
  /**
   * The content pack's `assets.flag.path`, e.g. `flags/SE.png`.
   *
   * Optional because it comes from a content pack rather than from code — a pack
   * without flags is a valid pack, and `Flag` already draws its own placeholder for a
   * path the bundle does not have.
   */
  readonly flagPath?: string | undefined
  readonly progress: EntityProgress
}

/**
 * How wide a flag is in the list.
 *
 * Small enough not to compete with the country name it identifies, large enough that
 * a tricolour is still three colours: the collection grid draws them at 72 where the
 * flag IS the content, and here the name is.
 */
const ROW_FLAG = 36

export type RegionScreenProps = {
  readonly region: RegionCode
  readonly regionNameKey: TranslationKey
  readonly countries: readonly CountryRow[]
  /**
   * The region's totals, from `regionProgress` in the engine.
   *
   * This screen used to add up `factsLearned` and `factsTotal` across the rows itself.
   * That agreed with the engine by construction — same per-entity numbers, same
   * addition — which is exactly what makes a second implementation dangerous rather
   * than obviously wrong: it agrees until one of them changes. `regionProgress` already
   * decides what counts (non-quizzable facts are excluded, or a disputed capital would
   * make a country permanently incompletable), and now one place decides it.
   *
   * It also carries `entitiesComplete` and `entitiesStarted`, which the reduce could
   * not produce without duplicating the "is this country finished?" rule as well — and
   * which turn out to be the number a user actually wants from a continent.
   */
  readonly progress: RegionProgress | null
  readonly onSelectCountry: (id: string) => void
  readonly onStartLesson: () => void
}

/**
 * How much of the banner the landmass takes.
 *
 * Smaller than it first looked right at. The banner is short and carries a heading, a
 * bar and two counts, so a landmass sized like the tile's ran straight under "0 of 19
 * countries finished" at full brightness. Clipped into the corner and dimmer than the
 * tile's, because there is more text here competing for the same rectangle.
 */
const BANNER_SILHOUETTE = 0.5

export function RegionScreen({
  region,
  regionNameKey,
  countries,
  progress: regionTotals,
  onSelectCountry,
  onStartLesson,
}: RegionScreenProps) {
  const t = useT()
  // Measured, like the Explore tile's: the sky has to cover the banner at every width,
  // and a constant would leave a bare stripe on a tablet.
  const [banner, setBanner] = useState({ width: 0, height: 0 })
  const compare = collator(currentLocale()).compare
  const sorted = [...countries].sort((a, b) => compare(a.name, b.name))

  // Null totals and no rows are the same situation — the content index has not
  // resolved — and they are handled together so nothing downstream has to ask twice.
  if (sorted.length === 0 || regionTotals === null) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.title} role="heading">
          {t('explore:countries.empty.title')}
        </Text>
        <Text style={styles.subtitle}>{t('explore:countries.empty.body')}</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* The continent's own sky, again.
   
          Tapping Europe on Explore meant leaving a card with weather on it and landing
          on a plain list — the art stopped at the door. This screen already knew its
          region and drew a 4pt colour swatch with it, which is the same information at
          a hundredth of the weight.
   
          The same art, the same `ArtScrim`, and the same measured sizing as the tile it
          came from — imported rather than re-declared, so a continent cannot have one
          picture on Explore and another one step in. */}
      <View
        style={styles.banner}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          setBanner((current) =>
            Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
              ? current
              : { width, height },
          )
        }}
      >
        <View style={styles.bannerArt} pointerEvents="none">
          <Art
            name={CONTINENT_ART[region]}
            size={continentArtSize(banner.width, banner.height)}
            frame="bleed"
          />
          <ArtScrim />
        </View>

        {/* The continent's own shape, on the continent's own screen.
   
            The Explore grid carries these as watermarks and this is where one of them
            gets to be the picture: the banner is 100 % about this one place, so the
            landmass belongs here at least as much as it does on a tile. Same treatment —
            bottom-trailing, dimmed, clipped by the banner — so arriving from a tile feels
            like the same object getting larger rather than a different screen.
   
            Decorative: the heading names the continent one line below it. */}
        {CONTINENT_SILHOUETTE[region] !== undefined && (
          <View style={styles.bannerShape} pointerEvents="none">
            <Art
              name={CONTINENT_SILHOUETTE[region]}
              size={continentArtSize(banner.width, banner.height) * BANNER_SILHOUETTE}
            />
          </View>
        )}

        <View style={styles.header}>
          <View style={[styles.swatch, { backgroundColor: palette.continent[region] }]} />
          <Text style={styles.title} role="heading">
            {t(regionNameKey)}
          </Text>
        </View>

        {/* Labelled with what it MEASURES. It said "Countries" while counting facts, so
            the banner read "Countries 0 / 56" directly above "0 of 19 countries
            finished" — two different numbers for the same noun, six pixels apart. Same
            defect as Home's quest card, where a bar of quest tasks sat under a sentence
            about lessons.

            `showCount` off because the label now carries both figures; leaving it on
            printed "0 / 56" twice on one line. */}
        <ProgressBar
          current={regionTotals.factsLearned}
          // `max(1, …)` because a region whose facts are all non-quizzable would divide
          // by zero, and an empty continent should read as 0 %, not as NaN.
          total={Math.max(1, regionTotals.factsTotal)}
          showCount={false}
          label={t('explore:region.facts', {
            learned: regionTotals.factsLearned,
            total: regionTotals.factsTotal,
          })}
        />
        <Tally style={styles.totals} numberStyle={styles.totalsNumber}>
          {t('explore:region.complete', {
            complete: regionTotals.entitiesComplete,
            total: regionTotals.entitiesTotal,
          })}
        </Tally>
      </View>

      <View style={styles.list}>
        {sorted.map(({ id, name, flagPath, progress }) => (
          <Pressable
            key={id}
            role="button"
            aria-disabled={false}
            onPress={() => onSelectCountry(id)}
            // One element per country: a reader announces "Sweden, Learning, 1 of 2
            // learned" rather than sweeping three separate text nodes.
            accessible
            aria-label={`${name}, ${t(MASTERY_LABEL[progress.mastery])}, ${t(
              'explore:region.progress',
              { learned: progress.factsLearned, total: progress.factsTotal },
            )}`}
            style={styles.row}
          >
            {/* Decorative. The row's own `aria-label` already names the country, and a
                reader saying "flag of Sweden, Sweden" is the same fact twice. */}
            <Flag path={flagPath} width={ROW_FLAG} />
            <View style={styles.rowText}>
              <Text style={styles.countryName}>{name}</Text>
              <Tally style={styles.countryMeta} numberStyle={styles.countryMetaNumber}>
                {t('explore:region.progress', {
                  learned: progress.factsLearned,
                  total: progress.factsTotal,
                })}
              </Tally>
            </View>
            <Text style={[styles.mastery, { color: MASTERY_COLOR[progress.mastery] }]}>
              {t(MASTERY_LABEL[progress.mastery])}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* One primary action per screen. From here, the only thing worth doing is
          learning some of it. */}
      <Button label={t('common:start')} onPress={onStartLesson} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  // The banner holds the sky and everything that sits on it. `overflow: hidden` so the
  // oversized art stops at the rounded corner rather than at the screen edge.
  // Bottom-trailing and dimmed, exactly as the Explore tile does it — see `tileShape`.
  bannerShape: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    opacity: 0.4,
  },
  banner: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    ...squircle,
    padding: space[4],
    gap: space[2],
  },
  bannerArt: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  swatch: { width: 8, height: 32, borderRadius: radius.full },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },

  // `secondary`, not `tertiary` — the same fix, for the same reason, as `regionDue` on
  // Explore. The contrast matrix records tertiary as large-text only: it clears 3:1 and
  // not 4.5:1, and this is a 13pt caption. It was wrong on a plain surface before the
  // sky went behind it; the sky only made it measurable. Over Africa's it read 4.0:1.
  totals: { ...text('caption'), color: colors.text.secondary },
  totalsNumber: { ...text('caption', { weight: '700', numeric: true }), color: colors.text.primary },
  list: { backgroundColor: colors.bg.surface, borderRadius: radius.lg, overflow: 'hidden', ...squircle },
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
  countryMetaNumber: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.primary,
  },
  mastery: { ...text('caption', { weight: '600' }) },
})
