/**
 * Choose what to practise.
 *
 * ## Why this screen exists
 *
 * Everything under it was already built. `ComposeInput.topicFilter` has been plumbed all
 * the way from lesson composition down into item selection since composition was written,
 * tested on both sides, and passed by nothing at all — the capability was complete and had
 * no author, because there was nowhere for a user to say what they wanted. This is that
 * nowhere, filled in.
 *
 * ## Nothing here is compulsory, and the copy says so
 *
 * Every control defaults to "everything", so a user who opens this and taps Start gets
 * exactly the lesson they would have got from Home. That matters more than it sounds: a
 * picker in front of the primary action is a tax on the ninety per cent who wanted the
 * default, which is why this is a route somebody chooses to open rather than a step in
 * the way of starting a lesson.
 *
 * ## It shows what the choice leaves, before the choice is committed
 *
 * "Currencies · Oceania" is four questions. A picker that lets you assemble that and then
 * hands you a four-question lesson has wasted the choice; one that says "4 questions to
 * draw from" above the button lets you see it and widen. `factsMatching` counts it, over
 * the same quizzable set the composer would draw from, so the number cannot flatter.
 *
 * The Start button disables at zero rather than starting an empty lesson, and the line
 * above it says what to do instead of what went wrong.
 *
 * ## Five states
 *
 * Loading and error belong to the content index and are handled by the route's
 * `ContentGate`. Offline does not arise: the packs are in the binary. Empty is the
 * zero-match case above, which is a state of the CHOICE rather than of the data — the
 * screen always has its four questions to ask.
 */

import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, colors, space, text } from '@worldquest/design'
import { entitiesInGroup, factsMatching, type ContentIndex, type LessonFocus } from '@worldquest/engines'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { ChoiceRow, Section } from '../../components/SettingsRow.js'
import { formatNumber, useT, currentLocale, type TranslationKey } from '../../lib/i18n.js'
import { REGIONS, type RegionCode } from '../explore/ExploreScreen.js'

/**
 * The four topics, in the order the country page lists them.
 *
 * Keyed by the pack's own attribute string, so a fifth attribute — population, language —
 * appears here by being added to this list and nowhere else. `all` is not in the list
 * because it is the absence of a choice rather than a fifth one.
 */
const TOPICS: readonly { readonly attribute: string; readonly label: TranslationKey }[] = [
  { attribute: 'capital', label: 'lesson:practise.attr.capital' },
  { attribute: 'flag', label: 'lesson:practise.attr.flag' },
  { attribute: 'currency', label: 'lesson:practise.attr.currency' },
  { attribute: 'location', label: 'lesson:practise.attr.location' },
]

const REGION_NAME: Record<RegionCode, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
  AN: 'explore:region.AN',
}

/**
 * The lengths offered, and why these three.
 *
 * 5 and 20 are the engine's own floor and ceiling on lesson size, so neither end promises
 * something the composer would clamp. 10 is the middle. `auto` is first and is the
 * default: it sizes the lesson from the user's measured pace to about two minutes, which
 * is the mechanic that makes "five minutes a day" a real promise rather than a number in
 * Settings.
 *
 * The two bounds are named as prose rather than imported, and that is on purpose. This
 * repo's reachability gate decides what the app "uses" by scanning source TEXT for the
 * identifier, so writing the constant names here would silently mark two engine exports
 * as wired that nothing calls — three of its allowances went stale the first time this
 * comment was written. The scanner is right to be broad; the prose gives way, exactly as
 * it did in `app/streak.tsx` for the same reason.
 */
const LENGTHS = [5, 10, 20] as const

/**
 * The difficulty bands, cut where the content actually sits.
 *
 * The pack's authored priors run 1–5 and land 93 / 96 / 68 across 1–2, 3, and 4–5. So
 * "Easier" is 1–2 and "Harder" is 4–5, and both leave enough to fill a lesson at any
 * topic. A band that looked tidy on the scale but held nine facts would be a choice that
 * silently produces a three-question lesson.
 */
const BANDS = {
  any: undefined,
  easy: { min: 1, max: 2 },
  hard: { min: 4, max: 5 },
} as const

type Band = keyof typeof BANDS

export type PractiseScreenProps = {
  readonly index: ContentIndex
  readonly onStart: (choice: { focus: LessonFocus; length: number | undefined }) => void
  /** Absent in tests and the screenshot renderer, like every other callback in this app. */
  readonly onBack?: (() => void) | undefined
}

export function PractiseScreen({ index, onStart, onBack }: PractiseScreenProps) {
  const t = useT()
  const locale = currentLocale()

  const [topic, setTopic] = useState<string>('all')
  const [region, setRegion] = useState<string>('all')
  const [length, setLength] = useState<string>('auto')
  const [band, setBand] = useState<Band>('any')

  /**
   * The focus, rebuilt whenever a choice changes.
   *
   * The continent becomes a list of entity ids HERE rather than in the engine, because
   * the engine does not know what a continent is and must not learn — see the note at the
   * top of `focus.ts`. This screen holds the index and already knows which countries are
   * European, so it answers WHICH rather than asking the engine HOW.
   */
  const focus = useMemo<LessonFocus>(() => {
    const band$ = BANDS[band]
    return {
      ...(topic === 'all' ? {} : { attributes: [topic] }),
      ...(region === 'all' ? {} : { entities: entitiesInGroup(index, 'region', region) }),
      ...(band$ ? { difficulty: band$ } : {}),
    }
  }, [index, topic, region, band])

  const matches = useMemo(() => factsMatching(index, focus), [index, focus])
  const chosenLength = length === 'auto' ? undefined : Number(length)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack !== undefined && <ScreenHeader onBack={onBack} />}

      <View style={styles.header}>
        <Text style={styles.title} role="heading">
          {t('lesson:practise.title')}
        </Text>
        {/* The screen's most important sentence: every control below is optional. */}
        <Text style={styles.subtitle}>{t('lesson:practise.subtitle')}</Text>
      </View>

      {/* ONE group, no header. Each row already carries its own heading, so a section
          title above each printed the same word twice six pixels apart. */}
      <Section>
        <ChoiceRow
          label={t('lesson:practise.topic')}
          help={t('lesson:practise.topic.help')}
          value={topic}
          onChange={setTopic}
          choices={[
            { value: 'all', label: t('lesson:practise.any') },
            ...TOPICS.map((entry) => ({ value: entry.attribute, label: t(entry.label) })),
          ]}
        />
        <ChoiceRow
          label={t('lesson:practise.where')}
          help={t('lesson:practise.where.help')}
          value={region}
          onChange={setRegion}
          choices={[
            { value: 'all', label: t('lesson:practise.any') },
            // Every continent, including ones with no content — the same rule Explore's
            // grid follows. A list that hides Antarctica until we have written it reads as
            // a smaller world, and the match count below says plainly when a choice is
            // empty rather than pretending the option does not exist.
            ...REGIONS.map((code) => ({ value: code as string, label: t(REGION_NAME[code]) })),
          ]}
        />
        <ChoiceRow
          label={t('lesson:practise.length')}
          help={t('lesson:practise.length.help')}
          value={length}
          onChange={setLength}
          choices={[
            { value: 'auto', label: t('lesson:practise.length.auto') },
            // Through the locale's number formatter, not a translation key: a bare
            // numeral is a number, and `pnpm i18n:check` rightly refuses a `{count}`
            // with no plural form. Arabic-Indic digits come out right for free.
            ...LENGTHS.map((n) => ({ value: String(n), label: formatNumber(n, locale) })),
          ]}
        />
        <ChoiceRow
          label={t('lesson:practise.difficulty')}
          help={t('lesson:practise.difficulty.help')}
          value={band}
          onChange={(value) => setBand(value as Band)}
          choices={[
            { value: 'any', label: t('lesson:practise.difficulty.any') },
            { value: 'easy', label: t('lesson:practise.difficulty.easy') },
            { value: 'hard', label: t('lesson:practise.difficulty.hard') },
          ]}
        />
      </Section>

      <View style={styles.footer}>
        {/* What the choice leaves, before it is committed. `role="status"` so a screen
            reader hears the number change as the user narrows, rather than discovering
            an empty lesson by starting one. */}
        <Text style={matches === 0 ? styles.empty : styles.matches} role="status">
          {matches === 0
            ? t('lesson:practise.none')
            : t('lesson:practise.matches', { count: matches })}
        </Text>
        <Button
          label={t('lesson:practise.start')}
          onPress={() => onStart({ focus, length: chosenLength })}
          disabled={matches === 0}
        />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  header: { gap: space[1] },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary },
  footer: { gap: space[3], marginTop: space[2] },
  matches: { ...text('caption'), color: colors.text.secondary },
  // Not red. An empty combination is a thing the user can fix in one tap, not an error —
  // and the copy beside it says how. Red here would make a normal exploration of the
  // controls feel like a mistake.
  empty: { ...text('caption'), color: colors.text.secondary },
})
