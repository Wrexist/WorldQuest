import { createThemeStyles } from '@worldquest/design'
/**
 * Country reference and entry to focused practice.
 * The September 27 redesign deliberately makes verified facts readable before a
 * quiz. Viewing a fact grants no mastery, XP or collection unlock; those remain
 * derived from lesson results. Assessment options still conceal their answers.
 * Flags and map geometry come from the validated content pack, never generated art.
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
  palette,
  space,
  text,
} from '@worldquest/design'
import type { EntityProgress, Mastery } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import type { RegionCode } from './ExploreScreen.js'
import { Icon } from '../../components/Icon.js'
import { ATTRIBUTE_ICON } from '../../lib/attributeIcons.js'

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
  // The nine from `scripts/build-deep-facts.cjs`. Listed here in the same change as the packs
  // for the reason the two notes above record: a missing entry falls through to the raw
  // attribute id, which looks deliberate to anyone who is not reading the packs.
  area: 'country:attribute.area',
  borders: 'country:attribute.borders',
  'border-count': 'country:attribute.borderCount',
  landlocked: 'country:attribute.landlocked',
  hemisphere: 'country:attribute.hemisphere',
  tld: 'country:attribute.tld',
  alpha3: 'country:attribute.alpha3',
  'currency-code': 'country:attribute.currencyCode',
  'native-name': 'country:attribute.nativeName',
}

/*
 * The glyph beside each attribute lives in `lib/attributeIcons.ts` now, shared with the
 * Home course path, so a flag step and the Flag row carry the same mark. A row without
 * one draws no icon rather than a placeholder — the rule the labels above wanted too.
 */

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
  /** Verified reference value; reading never changes mastery. */
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
  const { colors, styles } = useThemeValues()
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
        <View style={styles.identityControls}>
        {/* Decorative: the heading beside it is the country's name, and the flag's
            description is a fact in the list below, where a screen-reader user reads
            it as content rather than as a caption. */}
        <Flag
          path={assetPath}
          width={72}
          tint={region ? palette.continent[region] : colors.bg.surfaceRaised}
        />
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
        <Text style={styles.title} role="heading">
          {name}
        </Text>
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
  const { colors, styles } = useThemeValues()
  const t = useT()
  const label = ATTRIBUTE_LABEL[fact.attribute]
  const attribute = label ? t(label) : fact.attribute
  const glyph = ATTRIBUTE_ICON[fact.attribute]

  // Reference access and assessed mastery are separate.
  const known = fact.mastery !== 'unseen'
  const value = fact.value

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
        <Text style={styles.factValue}>{value}</Text>
        <Text style={styles.factAttribute}>{t(MASTERY_LABEL[fact.mastery])}</Text>
      </View>
      {fact.due && <Text style={styles.due}>{t('country:fact.due')}</Text>}
    </View>
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[3] },

  // Centred and generous: this is the page's one picture, and a locator map squeezed
  // into a corner is a decoration rather than an answer to "where is this?".
  map: { alignItems: 'center' },
  header: { gap: space[3] },
  identityControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The name gets the full width; large text never competes with the flag or favourite.
  title: { ...text('h1'), color: colors.text.primary, minWidth: 0, maxWidth: '100%' },
  body: { ...text('caption'), color: colors.text.secondary },

  star: { minWidth: 44, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },

  section: { gap: space[2] },
  sectionTitle: { ...text('overline'), color: colors.text.tertiary },
  list: { gap: space[3] },

  factRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  factText: { flex: 1, gap: space[1] },
  factAttribute: { ...text('caption'), color: colors.text.secondary },
  factValue: { ...text('bodyStrong'), color: colors.text.primary },
  due: { ...text('caption', { weight: '600' }), color: colors.reward.xp },

})
  return { colors, styles }
})
