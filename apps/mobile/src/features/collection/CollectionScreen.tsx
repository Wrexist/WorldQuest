/**
 * Collection — mockup screen 10 (flags) and its country twin.
 *
 * ## Why this screen is the game
 *
 * Quizzing is the mechanic; **collecting is the reason to come back**. A user who has
 * answered four hundred questions has nothing to look at unless we build them
 * something, and "you have 62 of 195 flags" is a far better reason to open the app
 * tomorrow than "you have 3,120 XP".
 *
 * ## Locked tiles are visible, and that is deliberate
 *
 * Every uncollected tile is shown, dimmed, with its country name readable. Hiding
 * unearned content is the single most common mistake in this genre: it makes the
 * collection feel small instead of making the gap feel closeable. Seeing the shape of
 * what you do not have yet is the motivation (screen-catalog.md §10).
 *
 * The copy follows from that. Nothing here says "locked" — nothing is being withheld,
 * the user simply has not learned it yet. The filter is "Still to find", not
 * "Missing", because one is an invitation and the other is a scoreboard of failure.
 *
 * Purely presentational. Mastery comes in already computed.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Art } from '../../components/Art.js'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Flag } from '../../components/Flag.js'
import {
  Button,
  Card,
  ProgressBar,
  Skeleton,
  colors,
  radius,
  space,
  staggerStyle,
  text,
  useStagger,
} from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { Icon } from '../../components/Icon.js'

/** One tile. `subtitle` is the flag description for flags, the capital for countries. */
export type CollectionTile = {
  readonly id: string
  readonly name: string
  readonly subtitle?: string | undefined
  /**
   * The content pack's `assets.flag.path`. Passed through rather than derived from
   * `id` so the pack stays the thing that decides which file a country's flag is —
   * see `lib/flags.ts`. Absent draws the placeholder.
   */
  readonly assetPath?: string | undefined
  /** Mastered — the user has actually learned this, not merely seen it once. */
  readonly collected: boolean
  /** Starred on the country page. A bookmark, orthogonal to `collected`. */
  readonly favourite?: boolean | undefined
}

export type CollectionFilter = 'all' | 'collected' | 'missing' | 'favourites'

export type CollectionScreenProps = {
  readonly title: string
  readonly tiles: readonly CollectionTile[]
  /**
   * Renders the reserved art slot on each tile instead of the subtitle text.
   *
   * For flags, the artwork IS the content — a truncated uppercase sentence describing
   * a flag is not a collectible, it is a caption with nowhere to go. The description
   * stays in the accessibility label, where it is the only thing a screen-reader user
   * has.
   *
   * This used to reserve an empty slot at flag proportions against the day real
   * artwork arrived. It has arrived (`components/Flag.tsx`), and the slot is now the
   * fallback rather than the plan.
   */
  readonly art?: boolean
  readonly loading?: boolean
  readonly onOpen?: ((id: string) => void) | undefined
  readonly onStartLesson?: (() => void) | undefined
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

const FILTERS: readonly CollectionFilter[] = ['all', 'collected', 'missing', 'favourites']
const FILTER_LABEL = {
  all: 'collection:filter.all',
  collected: 'collection:filter.collected',
  missing: 'collection:filter.missing',
  favourites: 'collection:filter.favourites',
} as const

/** Diacritic-insensitive: someone typing "Cote" should find "Côte d'Ivoire". */
const normalise = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function CollectionScreen({
  onBack,
  title,
  tiles,
  art = false,
  loading = false,
  onOpen,
  onStartLesson,
}: CollectionScreenProps) {
  const t = useT()
  const [filter, setFilter] = useState<CollectionFilter>('all')
  const [query, setQuery] = useState('')

  const collected = tiles.filter((tile) => tile.collected).length

  const shown = useMemo(() => {
    const needle = normalise(query)
    return tiles.filter((tile) => {
      if (filter === 'collected' && !tile.collected) return false
      if (filter === 'missing' && tile.collected) return false
      if (filter === 'favourites' && tile.favourite !== true) return false
      if (needle.length > 0 && !normalise(tile.name).includes(needle)) return false
      return true
    })
  }, [tiles, filter, query])

  /**
   * `search_performed`, once per search — not once per keystroke.
   *
   * A per-keystroke event would record "swe" and "swed" and "swede" as three searches
   * and make the average query length meaningless. Firing 700 ms after typing stops
   * records the query the user actually meant.
   *
   * `query_length` rather than the query itself, on purpose: a free-text field on a
   * child's device is the easiest place in this app to accidentally collect something
   * personal, and the length answers every question the spec asks of it. `selected` is
   * left to the tile press so this stays a fact about the search, not a prediction.
   */
  const settled = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (query.trim().length === 0) return
    if (settled.current !== null) clearTimeout(settled.current)
    settled.current = setTimeout(() => {
      track('search_performed', {
        query_length: query.trim().length,
        result_count: shown.length,
        selected: false,
      })
    }, 700)
    return () => {
      if (settled.current !== null) clearTimeout(settled.current)
    }
  }, [query, shown.length])

  return (
    <View style={styles.root}>
      {onBack !== undefined && <ScreenHeader onBack={onBack} />}
      <View style={styles.header}>
        <Text style={styles.title} role="heading" aria-level={1}>
          {title}
        </Text>

        {/* The count, not a percentage. "62 of 195" says how far the next one is;
            "32%" says nothing a user can act on.

            The label says what is counted, not how many: `showCount` already renders
            the number on the right, and passing the count here too printed "0 of 65"
            and "0 / 65" side by side. A screen reader still hears the figure — it
            comes from `accessibilityValue`, not from this string. */}
        <ProgressBar
          current={collected}
          total={tiles.length}
          showCount
          label={t('collection:progress.label')}
          valueText={t('collection:progress', { collected, total: tiles.length })}
        />

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('collection:search')}
          placeholderTextColor={colors.text.tertiary}
          accessibilityLabel={t('collection:search')}
          autoCorrect={false}
        />

        {/* Scrolls sideways rather than wrapping.
   
            Four chips do not fit one row at 320, so "Starred" dropped alone onto a
            second line — a row of controls that changes height between devices, with
            one member visually demoted for no reason a user could infer. Wrapping is
            also the wrong direction to fail: a fifth filter, or a locale with longer
            words, makes the block taller on exactly the screens with least room.
   
            `alwaysBounceHorizontal` off so it does not rubber-band on a phone wide
            enough to hold all four, where there is nothing to scroll to. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((option) => (
            <Card
              key={option}
              level={filter === option ? 3 : 1}
              role="radio"
              aria-checked={filter === option}
              accessibilityLabel={t(FILTER_LABEL[option])}
              onPress={() => setFilter(option)}
              style={[styles.filter, filter === option && styles.filterOn]}
            >
              <Text style={filter === option ? styles.filterTextOn : styles.filterText}>
                {t(FILTER_LABEL[option])}
              </Text>
            </Card>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.grid}>
          {/* Skeletons in the tile's shape, not a spinner. The user should see the
              collection arriving, not a blank screen with a wheel on it. */}
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} width="30%" height={96} style={styles.tile} />
          ))}
        </View>
      ) : shown.length === 0 ? (
        // Three different nothings, and they need three different answers. A search
        // that missed is a spelling problem; an empty favourites list is a "you have
        // not used this yet" problem whose next step is a star, not a lesson; an empty
        // collection is a lesson. Offering "Start a lesson" to someone who has starred
        // nothing sends them to the one place that will not fix it.
        <View style={styles.empty}>
          {/* The display case with one slot lit — "anticipation, not absence" — and it
              belongs to exactly one of the three nothings above. A search that found
              nothing is a spelling problem, and an empty case illustrating it would
              say the collection is empty when it is not. Same argument as the button
              below, which is why they share a condition. */}
          {query.length === 0 && filter !== 'favourites' && (
            <Art name="states/empty-collection" size={140} />
          )}
          <Text style={styles.emptyTitle}>
            {query.length > 0
              ? t('collection:search.none.title', { query })
              : filter === 'favourites'
                ? t('collection:favourites.none.title')
                : t('collection:empty.title')}
          </Text>
          <Text style={styles.emptyBody}>
            {query.length > 0
              ? t('collection:search.none.body')
              : filter === 'favourites'
                ? t('collection:favourites.none.body')
                : t('collection:empty.body')}
          </Text>
          {query.length === 0 && filter !== 'favourites' && onStartLesson !== undefined && (
            <Button label={t('collection:empty.action')} onPress={onStartLesson} />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {shown.map((tile, index) => (
            <Tile key={tile.id} tile={tile} index={index} art={art} onOpen={onOpen} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function Tile({
  tile,
  index,
  art,
  onOpen,
}: {
  readonly tile: CollectionTile
  readonly index: number
  readonly art: boolean
  readonly onOpen: ((id: string) => void) | undefined
}) {
  const t = useT()
  // This grid is the case `motion.stagger`'s `maxItems` was written for: sixty-five
  // tiles at 40 ms each would take two and a half seconds to finish arriving. The
  // cascade covers the first screenful and everything below it lands with the sixth.
  const entrance = useStagger(index)

  // Everything the tile says, said once, to a screen reader — the name, what it is,
  // whether it has been collected, and whether it is starred. Without the subtitle
  // here, a blind user gets a grid of country names and no flag at all; without the
  // star, the marker in the corner is information only sighted users get.
  const label = [
    tile.name,
    tile.subtitle,
    tile.collected ? t('collection:collected') : t('collection:locked'),
    tile.favourite === true ? t('collection:favourite') : undefined,
  ]
    .filter((part) => part !== undefined && part.length > 0)
    .join(', ')

  return (
    <Animated.View style={[styles.tileCell, staggerStyle(entrance)]}>
    <Card
      level={tile.collected ? 2 : 1}
      // The state is IN the label, not only in the dimming. A screen-reader user gets
      // the same information a sighted one gets from the opacity.
      accessibilityLabel={label}
      {...(onOpen !== undefined ? { onPress: () => onOpen(tile.id), role: 'button' as const } : {})}
      style={[styles.tile, !tile.collected && styles.tileDim]}
    >
      {art ? (
        // The real flag, from the content pack's own asset path. `Flag` falls back to
        // the placeholder this used to be if the bundle has no file for it — never to
        // another country's artwork.
        //
        // Decorative: the tile's accessibility label above already reads the country,
        // the flag's description and whether it is collected, so an announcing image
        // would say the same things a second time.
        <Flag path={tile.assetPath} width={72} />
      ) : (
        tile.subtitle !== undefined && (
          <Text style={styles.tileSub} numberOfLines={3}>
            {tile.subtitle}
          </Text>
        )
      )}
      {/* No line cap. The name is the tile's identity — a country the user cannot
          read is a tile that does nothing — and the card grows because it is sized
          with `minHeight`. Two lines held every name in English at 100 %, which is
          exactly the assumption the 200 %-text check exists to break: "Papua New
          Guinea" wants three lines at that size and was being cut to "Papua New". */}
      <Text style={styles.tileName}>{tile.name}</Text>
      {tile.favourite === true && (
        // Decoration only — the state is already in the label above, so this is
        // hidden from the screen reader rather than read out a second time.
        <Icon name="star" size={14} color={colors.action.secondary} />
      )}
    </Card>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: space[4], gap: space[3] },
  title: { ...text('h1'), color: colors.text.primary },
  search: {
    ...text('body'),
    color: colors.text.primary,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    // 44pt floor for a touch target, and a text field is a touch target.
    height: 48,
  },
  // Wraps: four chips do not fit on one line at 390pt, and they fit on none of them at
  // 200 % text. Two rows of two is the honest layout rather than a hidden scroller.
  filters: { flexDirection: 'row', gap: space[2], paddingEnd: space[4] },
  // 44pt floor, met by the chip itself rather than by hit slop. Padding alone put
  // these at 40pt — close enough to look right in a screenshot and wrong under a
  // thumb, which is precisely the class of defect `pnpm design:shots` exists to
  // measure. The search field two rules up already had the same note; the chips were
  // missed because nothing was looking.
  filter: {
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    minHeight: 44,
    justifyContent: 'center',
  },
  filterOn: { borderColor: colors.action.primary, borderWidth: 2 },
  filterText: { ...text('caption'), color: colors.text.secondary },
  filterTextOn: { ...text('caption', { weight: '700' }), color: colors.text.primary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingBottom: space[6],
  },
  // Two up, not three.
  //
  // A country name is one unbreakable word and a three-column grid on a 390 pt screen
  // gives it about 105 pt. That holds "Chile" and does not hold "Argentina" — at the
  // 200 % text setting the names ran straight out of their tiles and over the ones
  // beside them, which the overlap check in `pnpm e2e` now catches.
  //
  // The alternatives were worse. Shrinking the text to fit is `adjustsFontSizeToFit`,
  // which react-native-web does not implement, so it would be a fix nothing here could
  // verify. Reflowing on `fontScale` is the textbook answer and would be invisible to
  // the harness for the same reason — react-native-web reports a scale of 1 whatever
  // the OS says — so it would be a device-only fix taken on trust.
  //
  // Two columns needs no platform branch and no conditional: it is simply wide enough,
  // at every text size, on every renderer. The tiles are chunkier for it, which suits
  // the rest of the system.
  // The cell owns the grid width; the tile fills the cell. Split when the tiles gained
  // a staggered entrance — the transform belongs on a wrapper rather than on the Card,
  // which has its own press transform.
  tileCell: { width: '48%' },
  tile: { width: '100%', minHeight: 116, padding: space[3], alignItems: 'center', justifyContent: 'center', gap: space[1] },
  // Dimmed, never hidden. See the header comment — this is the whole design.
  tileDim: { opacity: 0.45 },
  tileName: { ...text('caption', { weight: '700' }), color: colors.text.primary, textAlign: 'center' },
  // Absolute so a starred tile is exactly the same height as an unstarred one —
  // otherwise starring a country makes its row jump.
  //
  // `h3` (18px), not `caption`. This blue is 4.42:1 on surface, which clears the
  // large-text floor and misses the small-text one — so the glyph that carries the
  // meaning has to be large text. `design:contrast` holds the other end of that.
  tileStar: {
    ...text('h3'),
    color: colors.action.secondary,
    position: 'absolute',
    top: space[1],
    // `end`, not `right`: in Arabic or Hebrew the tile mirrors and a physical `right`
    // would leave the star on the wrong corner, overlapping the name.
    end: space[1],
  },
  tileSub: { ...text('caption'), color: colors.text.tertiary, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[5], gap: space[2] },
  emptyTitle: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  emptyBody: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
})
