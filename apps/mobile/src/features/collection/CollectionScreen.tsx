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

import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  ArtSlot,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  colors,
  radius,
  space,
  text,
} from '@worldquest/design'
import { useT } from '../../lib/i18n.js'

/** One tile. `subtitle` is the flag description for flags, the capital for countries. */
export type CollectionTile = {
  readonly id: string
  readonly name: string
  readonly subtitle?: string | undefined
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
   * a flag is not a collectible, it is a caption with nowhere to go. The slot holds
   * the right space at the right aspect ratio, so the sourced SVGs drop in without a
   * relayout. The description stays in the accessibility label, where it is the only
   * thing a screen-reader user has.
   */
  readonly art?: boolean
  readonly loading?: boolean
  readonly onOpen?: ((id: string) => void) | undefined
  readonly onStartLesson?: (() => void) | undefined
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

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title} role="heading" aria-level={1}>
          {title}
        </Text>

        {/* The count, not a percentage. "62 of 195" says how far the next one is;
            "32%" says nothing a user can act on. */}
        <ProgressBar
          current={collected}
          total={tiles.length}
          showCount
          label={t('collection:progress', { collected, total: tiles.length })}
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

        <View style={styles.filters}>
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
        </View>
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
          {shown.map((tile) => (
            <Tile key={tile.id} tile={tile} art={art} onOpen={onOpen} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function Tile({
  tile,
  art,
  onOpen,
}: {
  readonly tile: CollectionTile
  readonly art: boolean
  readonly onOpen: ((id: string) => void) | undefined
}) {
  const t = useT()

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
    <Card
      level={tile.collected ? 2 : 1}
      // The state is IN the label, not only in the dimming. A screen-reader user gets
      // the same information a sighted one gets from the opacity.
      accessibilityLabel={label}
      {...(onOpen !== undefined ? { onPress: () => onOpen(tile.id), role: 'button' as const } : {})}
      style={[styles.tile, !tile.collected && styles.tileDim]}
    >
      {art ? (
        // 3:2 — the aspect ratio of most national flags, so the sourced SVG replaces
        // this without moving a single tile.
        <ArtSlot tint={colors.bg.surfaceRaised} glyph="⚑" width={72} height={48} />
      ) : (
        tile.subtitle !== undefined && (
          <Text style={styles.tileSub} numberOfLines={2}>
            {tile.subtitle}
          </Text>
        )
      )}
      <Text style={styles.tileName} numberOfLines={2}>
        {tile.name}
      </Text>
      {tile.favourite === true && (
        // Decoration only — the state is already in the label above, so this is
        // hidden from the screen reader rather than read out a second time.
        <Text style={styles.tileStar} aria-hidden>
          ★
        </Text>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas },
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  filter: { paddingVertical: space[2], paddingHorizontal: space[3] },
  filterOn: { borderColor: colors.action.primary, borderWidth: 1 },
  filterText: { ...text('caption'), color: colors.text.secondary },
  filterTextOn: { ...text('caption', { weight: '700' }), color: colors.text.primary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingBottom: space[6],
  },
  tile: { width: '31%', minHeight: 104, padding: space[2], alignItems: 'center', justifyContent: 'center', gap: space[1] },
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
