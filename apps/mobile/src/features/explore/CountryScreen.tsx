/**
 * A country — mockup screen 7.
 *
 * ## The rule that shapes this screen
 *
 * It does NOT spoil what the user has not learned. A fact they have never met shows
 * its label and "Learn it first", not its answer. Otherwise the page is a cheat sheet:
 * a user who cannot recall Sweden's capital opens this, reads it, and the scheduler
 * never finds out they did not know it. The whole point of spaced repetition is that
 * retrieval is effortful — handing over the answer for free is not a shortcut, it is
 * the mechanism failing.
 *
 * Facts already learned are shown in full, because at that point the page is a
 * reference rather than an answer key.
 *
 * ## Sources are visible
 *
 * Every fact carries where it came from and when it was last checked, and this screen
 * shows both. A learning app that cannot say where a fact came from is asking to be
 * trusted on nothing — and a wrong fact here is the worst bug this product can have.
 *
 * The flag image is the real artwork, from the content pack's own asset path — flags
 * are SOURCED, never generated, because a drawn-from-memory flag with the wrong number
 * of stars is a wrong fact. The flag's DESCRIPTION is separately real content, treated
 * as a fact like any other, which is what makes the flag question screen-reader safe.
 *
 * ## The heart
 *
 * A favourite is a bookmark and nothing more — see `features/favourites`. It changes
 * what the collection can show you; it never changes what the scheduler asks.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Flag } from '../../components/Flag.js'
import { CountryMap } from '../../components/CountryMap.js'
import {
  Button,
  Card,
  ProgressBar,
  colors,
  palette,
  space,
  text,
} from '@worldquest/design'
import type { EntityProgress, Mastery } from '@worldquest/engines'
import { formatDate, useT, currentLocale, type TranslationKey } from '../../lib/i18n.js'
import type { RegionCode } from './ExploreScreen.js'
import { Icon } from '../../components/Icon.js'

const ATTRIBUTE_LABEL: Record<string, TranslationKey> = {
  capital: 'country:attribute.capital',
  flag: 'country:attribute.flag',
  population: 'country:attribute.population',
  currency: 'country:attribute.currency',
  language: 'country:attribute.language',
}

const MASTERY_LABEL: Record<Mastery, TranslationKey> = {
  unseen: 'explore:mastery.unseen',
  learning: 'explore:mastery.learning',
  familiar: 'explore:mastery.familiar',
  proficient: 'explore:mastery.proficient',
  mastered: 'explore:mastery.mastered',
  burnished: 'explore:mastery.burnished',
}

export type CountryFact = {
  readonly id: string
  readonly attribute: string
  /** The answer. Withheld from the screen until the user has met it. */
  readonly value: string
  readonly mastery: Mastery
  readonly due: boolean
  readonly source?: { readonly name: string; readonly url?: string; readonly verifiedAt: string }
}

export type CountryScreenProps = {
  readonly name: string | null
  readonly region: RegionCode | null
  /** The pack's `assets.flag.path`. Absent draws the placeholder, never another flag. */
  readonly assetPath?: string | undefined
  /** The country's outline, from the pack's `assets.map.path`. */
  readonly mapPath?: string | undefined
  /** The land around it, from `assets.mapContext.path` — same frame, drawn behind. */
  readonly mapContextPath?: string | undefined
  readonly facts: readonly CountryFact[]
  readonly progress: EntityProgress | null
  readonly onPractise: () => void
  /**
   * Both optional together: the screenshot renderer and the component tests mount this
   * without a store, and a heart that cannot be toggled should not be drawn at all.
   */
  readonly favourite?: boolean | undefined
  readonly onToggleFavourite?: (() => void) | undefined
  /**
   * Renders the back control. Optional so component tests and the screenshot
   * renderer can mount this without a router; a route must always pass it.
   *
   * This screen had no way back at all — the root Stack sets `headerShown: false`
   * and nothing replaced it, so `pnpm a11y:tree` found a route a keyboard or screen
   * reader could enter and not leave.
   */
  readonly onBack?: (() => void) | undefined

}

/** The page's one picture. Wide enough to find Belgium in Europe at 320pt. */
const MAP_WIDTH = 240

export function CountryScreen({
  onBack,
  name,
  region,
  assetPath,
  mapPath,
  mapContextPath,
  facts,
  progress,
  onPractise,
  favourite = false,
  onToggleFavourite,
}: CountryScreenProps) {
  const t = useT()
  const locale = currentLocale()

  // A deep link can name a country the shipped packs do not have. Saying so beats an
  // empty page that reads as a crash.
  if (name === null) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.title} role="heading">
          {t('country:missing.title')}
        </Text>
        <Text style={styles.body}>{t('country:missing.body')}</Text>
      </View>
    )
  }

  const sources = facts
    .map((fact) => fact.source)
    .filter((source): source is NonNullable<CountryFact['source']> => source !== undefined)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack !== undefined && <ScreenHeader onBack={onBack} />}
      <View style={styles.header}>
        {/* Decorative: the heading beside it is the country's name, and the flag's
            description is a fact in the list below, where a screen-reader user reads
            it as content rather than as a caption. */}
        <Flag
          path={assetPath}
          width={72}
          tint={region ? palette.continent[region] : colors.bg.surfaceRaised}
        />
        <Text style={styles.title} role="heading">
          {name}
        </Text>
        {onToggleFavourite !== undefined && (
          <Pressable
            // `switch` rather than `button`: it is on or off, and a button role would
            // announce "Saved, button" with no way to hear which. `aria-checked`
            // rather than `accessibilityState` because react-native-web drops the
            // latter (see Card).
            role="switch"
            aria-checked={favourite}
            aria-label={t('country:favourite.label')}
            onPress={onToggleFavourite}
            // 44pt, even though the glyph is 24. A target the size of the glyph is one
            // only an adult with a small thumb reliably hits.
            hitSlop={space[2]}
            style={styles.star}
          >
            {/* One shape, tinted. `★` vs `☆` were two different characters that
                happened to exist in the system font; on a device missing one of
                them the control silently loses its state. The label already
                carries the state for a screen reader. */}
            <Icon
              name="star"
              size={24}
              color={favourite ? colors.action.secondary : colors.text.tertiary}
            />
          </Pressable>
        )}
      </View>

      {/* Where it is, before what is true about it.
          The country page opened on a flag, a name and a list of facts, and never
          once said where in the world any of it was — in a geography app. The outline
          is content, not decoration: it comes from Natural Earth via the pack's
          `assets.map`, tinted from tokens rather than baked. Decorative to a screen
          reader on purpose, because the heading above already names the country and
          the region is a fact in the list below. */}
      <View style={styles.map}>
        {/* Green highlight, continent-tinted context — not the other way round.
            Tinting the highlight with the continent identity colour put Sweden in
            blue on a blue-grey Europe, and the one thing this picture has to do is
            separate figure from ground. Green already means "you" everywhere else in
            the app, and it clears 3:1 against the muted base at every continent. */}
        <CountryMap
          path={mapPath}
          contextPath={mapContextPath}
          width={MAP_WIDTH}
        />
      </View>

      {progress !== null && progress.factsTotal > 0 && (
        <ProgressBar
          current={progress.factsLearned}
          total={progress.factsTotal}
          showCount={false}
          label={t('country:progress', {
            learned: progress.factsLearned,
            total: progress.factsTotal,
          })}
        />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} role="heading">
          {t('country:facts.title')}
        </Text>
        <Card style={styles.list}>
          {facts.map((fact) => (
            <FactRow key={fact.id} fact={fact} />
          ))}
        </Card>
      </View>

      {sources.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} role="heading">
            {t('country:source.title')}
          </Text>
          <Card style={styles.list}>
            {sources.map((source, index) => (
              <View key={`${source.name}-${index}`} style={styles.sourceRow}>
                <Text style={styles.sourceName}>{source.name}</Text>
                <Text style={styles.body}>
                  {t('country:source.verified', {
                    date: formatDate(Date.parse(source.verifiedAt), locale),
                  })}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      )}

      <Button label={t('country:practice')} onPress={onPractise} />
    </ScrollView>
  )
}

function FactRow({ fact }: { fact: CountryFact }) {
  const t = useT()
  const label = ATTRIBUTE_LABEL[fact.attribute]
  const attribute = label ? t(label) : fact.attribute

  // The rule at the top of this file, in one line.
  const known = fact.mastery !== 'unseen'
  const value = known ? fact.value : t('country:fact.hidden')

  return (
    <View
      accessible
      aria-label={t('country:fact.label', {
        attribute,
        value,
        mastery: t(MASTERY_LABEL[fact.mastery]),
      })}
      style={styles.factRow}
    >
      <View style={styles.factText}>
        <Text style={styles.factAttribute}>{attribute}</Text>
        <Text style={[styles.factValue, !known && styles.factHidden]}>{value}</Text>
      </View>
      {fact.due && <Text style={styles.due}>{t('country:fact.due')}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  // Centred and generous: this is the page's one picture, and a locator map squeezed
  // into a corner is a decoration rather than an answer to "where is this?".
  map: { alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  title: { ...text('h1'), color: colors.text.primary, flex: 1, flexShrink: 1 },
  body: { ...text('caption'), color: colors.text.secondary },

  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Blue, not gold and not red. Gold is XP and coins; red is the hearts you lose in a
  // lesson. A saved country is neither a reward nor a life, and a ten-year-old who
  // sees the same colour for three different things learns none of them.
  starOn: { ...text('h2'), color: colors.action.secondary },
  // Not `tertiary` — an outline star is already quiet, and a quiet colour on top of a
  // quiet shape is a control nobody notices is a control.
  starOff: { ...text('h2'), color: colors.text.secondary },

  section: { gap: space[2] },
  sectionTitle: { ...text('overline'), color: colors.text.tertiary },
  list: { gap: space[3] },

  factRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  factText: { flex: 1, gap: space[1] },
  factAttribute: { ...text('caption'), color: colors.text.secondary },
  factValue: { ...text('bodyStrong'), color: colors.text.primary },
  // Not greyed out to nothing — the row still has to read as a fact that exists.
  factHidden: { color: colors.text.tertiary },
  due: { ...text('caption', { weight: '600' }), color: colors.reward.xp },

  sourceRow: { gap: space[1] },
  sourceName: { ...text('caption', { weight: '600' }), color: colors.text.primary },
})
