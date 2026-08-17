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
 * ## Sources are NOT on this screen, and that is the same rule again
 *
 * This screen used to list every fact's citation under a heading reading "Where this
 * comes from". It defeated the rule directly above. The list printed
 *
 *   English Wikipedia, “Stockholm”
 *   Swedish Act on the National Flag (SFS 1982:269)
 *   English Wikipedia, “Swedish krona”
 *
 * six inches under three rows that each said "Learn it first". The spoiler guard hid
 * the answers and the citations gave all three away, on the same screen, to a user who
 * had learned none of them — and for the two Wikipedia ones the answer is the title of
 * the article. A free look at an item the scheduler is about to score.
 *
 * The DATA is untouched: every fact still carries `source` and `verifiedAt`, the content
 * pipeline still requires them, and `pnpm content:validate` still fails a fact without
 * one. What changed is that the citation is no longer rendered beside a hidden answer.
 * If sourcing should be user-visible somewhere — and there is a real argument that it
 * should — it belongs where it cannot leak: on a fact the user has already learned, or
 * on a page of its own that is not the quiz.
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
import { StickyFooter } from '../../components/StickyFooter.js'
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
import { useT, type TranslationKey } from '../../lib/i18n.js'
import type { RegionCode } from './ExploreScreen.js'
import { Icon } from '../../components/Icon.js'
import type { IconName } from '../../lib/icons.generated.js'

/**
 * Every attribute the packs can carry, and `location` was missing from it.
 *
 * A fact whose attribute is absent here falls through to `fact.attribute` — the raw
 * string — so the row would have read "location" in lower case beside "Capital" and
 * "Currency". It never showed, because `facts.locations.v1.json` was never imported
 * (see `src/lib/content.ts`); the day it was, this gap would have shipped with it.
 *
 * "Continent" rather than "Location", because that is what the pack actually answers
 * with: the seven-continent model, per `scripts/build-locations.cjs`. A label naming
 * the field rather than the answer is how a user ends up expecting a city.
 *
 * `population` and `language` have no facts behind them yet and stay listed: they are
 * named in the country-page catalogue and cost nothing to keep ready.
 */
const ATTRIBUTE_LABEL: Record<string, TranslationKey> = {
  capital: 'country:attribute.capital',
  flag: 'country:attribute.flag',
  location: 'country:attribute.location',
  population: 'country:attribute.population',
  currency: 'country:attribute.currency',
  language: 'country:attribute.language',
  // The second time this list has shipped a hole, and the second time the hole was
  // 67 facts wide. `location` was missing once; `calling-code` was missing since the
  // dialling-code templates landed, so every one of the 65 country pages printed the
  // raw pack key `calling-code` in a column beside Capital, Flag and Currency.
  //
  // The fall-through below is what made it survive: rendering the attribute id is a
  // reasonable last resort for an id nobody has met, and it looks exactly like a
  // deliberate label to anyone who is not reading the packs.
  'calling-code': 'country:attribute.callingCode',
}

/**
 * The glyph beside each attribute.
 *
 * The list was five identical rows of two words, which is a column the eye has to READ
 * to navigate. A mark per kind is what lets somebody find the capital without reading,
 * and the same glyphs name the same things in a quest and in the shop.
 *
 * `Partial`, and a row without one draws no icon rather than a placeholder: an attribute
 * that arrives before its glyph should be a plain row, not a broken one. That is the same
 * rule the labels above wanted and did not have.
 */
const ATTRIBUTE_ICON: Partial<Record<string, IconName>> = {
  capital: 'capital',
  flag: 'flag',
  location: 'continent',
  population: 'profile',
  currency: 'currency',
  language: 'language',
  'calling-code': 'callingCode',
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

  return (
    /* A column, not a bare scroller. The practice button is this page's whole purpose and
       it used to be the last child of the ScrollView — below the fold on every country
       with more than a few facts, so the primary action was reachable only by scrolling
       past the content you had come to read. See `StickyFooter`. */
    <View style={styles.screen}>
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

    </ScrollView>

      <StickyFooter>
        <Button label={t('country:practice')} onPress={onPractise} fullWidth />
      </StickyFooter>
    </View>
  )
}

function FactRow({ fact }: { fact: CountryFact }) {
  const t = useT()
  const label = ATTRIBUTE_LABEL[fact.attribute]
  const attribute = label ? t(label) : fact.attribute
  const glyph = ATTRIBUTE_ICON[fact.attribute]

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
      {/* Decorative: the row is one accessibility element already naming the attribute,
          and a reader announcing "landmark" before "Capital" is a word with no
          referent. Dimmed while the fact is unknown, so the column reads as a set of
          slots to fill rather than a set of facts you have. */}
      {glyph !== undefined && (
        <Icon
          name={glyph}
          size={20}
          color={known ? colors.text.secondary : colors.text.tertiary}
        />
      )}
      <View style={styles.factText}>
        <Text style={styles.factAttribute}>{attribute}</Text>
        <Text style={[styles.factValue, !known && styles.factHidden]}>{value}</Text>
      </View>
      {fact.due && <Text style={styles.due}>{t('country:fact.due')}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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

})
