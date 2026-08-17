/**
 * Explore — mockup screen 9, the continents grid.
 *
 * The screen that answers "how much of the world do I actually know?". It is built
 * entirely from `worldProgress()` in the engines, which means the numbers here and
 * the numbers the scheduler acts on can never disagree — there is only one of them.
 *
 * Every continent is shown, including ones with no content yet. A grid that hides
 * Africa until we have written Africa reads as a smaller world, and a user who never
 * sees the gap never knows there is more coming.
 *
 * The mockup's globe is deliberately not here: it needs map geometry, which is an
 * unresolved licensing decision (docs/plan/phase-0-checklist.md). Colour and type
 * carry the continents until then, and neither is a placeholder.
 */

import { useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import {
  ArtScrim,
  Card,
  colors,
  palette,
  ProgressBar,
  radius,
  Skeleton,
  space,
  squircle,
  staggerStyle,
  Tally,
  text,
  useStagger,
} from '@worldquest/design'
import type { WorldProgress } from '@worldquest/engines'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { TopBar } from '../../components/TopBar.js'
import type { ArtName } from '../../lib/art.generated.js'
import { Icon } from '../../components/Icon.js'

/**
 * Every continent, in the order the grid shows them — most-populated first rather
 * than alphabetically, because a user opening this screen wants somewhere to start
 * and Antarctica is not it.
 */
export const REGIONS = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'AN'] as const
export type RegionCode = (typeof REGIONS)[number]

/**
 * The atmospheric background behind each continent card.
 *
 * Keyed by region code so the map cannot drift from `REGIONS` — a continent added to
 * that list without art here is a type error rather than a blank tile.
 */
export const CONTINENT_ART: Record<RegionCode, ArtName> = {
  EU: 'continents/EU',
  AS: 'continents/AS',
  AF: 'continents/AF',
  NA: 'continents/NA',
  SA: 'continents/SA',
  OC: 'continents/OC',
  AN: 'continents/AN',
}

/**
 * The continent's own landmass, laid over its sky.
 *
 * The sky above is atmosphere and says so in `asset-prompts.md` §8 — deliberately no
 * coastline, because a generated coastline is a wrong fact and a generated border is a
 * political claim. That left the Explore grid as seven coloured moods: correct, and not
 * a map of anywhere. These are the shapes, delivered as art rather than derived, and
 * they are what makes a card read as a place you can go.
 *
 * `Partial`, and Antarctica is the reason. `REGIONS` has seven entries and the delivery
 * has six; a record typed as total would need a lie for AN, and the tile renders without
 * a silhouette instead. Typing the gap is what makes the missing one visible here rather
 * than at runtime.
 */
/**
 * How much of the tile the landmass takes.
 *
 * Bigger than it looks, because it is anchored into the BOTTOM-TRAILING CORNER and
 * clipped by the card — most of the extra falls off the edge, which is what gives the
 * shape somewhere to be without needing a column of its own.
 *
 * The first version reserved a column instead, insetting the copy by 30 % so the two sat
 * side by side. On a 390 phone that left the text about 95pt and "19 countries to meet"
 * wrapped to two lines in Europe and not in Asia — so the row came out crooked, which is
 * a worse crime than an overlap. A watermark under the words, dimmed and cornered, gives
 * the copy the whole card back and still reads as a map of somewhere.
 */
const SILHOUETTE_OF_TILE = 0.62

export const CONTINENT_SILHOUETTE: Partial<Record<RegionCode, ArtName>> = {
  EU: 'continents-silhouette/EU',
  AS: 'continents-silhouette/AS',
  AF: 'continents-silhouette/AF',
  NA: 'continents-silhouette/NA',
  SA: 'continents-silhouette/SA',
  OC: 'continents-silhouette/OC',
}

/**
 * Drawn larger than the tile it fills, and MEASURED from the tile rather than fixed.
 *
 * These are 3:2 and the tile is roughly square, so sizing the art to the tile's width
 * would leave bands above and below. Over-sizing lets the middle of the sky fill the
 * card and the card's own `overflow: hidden` crops the rest.
 *
 * It was a constant 260 until a tablet shot showed why that cannot work: at 768 the
 * tiles are ~355 wide, so the sky stopped 95 points short of the right edge and each
 * card had a navy stripe down its side. 200 % text has the same effect on the other
 * axis — a taller tile outgrows a fixed square just as a wider one does.
 *
 * `Art` draws a 3:2 image `size` wide and `size / 1.5` tall, so covering a `w × h` tile
 * needs `size ≥ w` and `size ≥ 1.5 h`, whichever binds.
 */
export const continentArtSize = (width: number, height: number) => Math.ceil(Math.max(width, height * 1.5))

/**
 * Exported because onboarding's continent picker needs the same seven names.
 *
 * There is a third copy in `app/region/[code].tsx`; this is one fewer than there was,
 * and the right end state is one map that all three import.
 */
export const REGION_NAME: Record<RegionCode, TranslationKey> = {
  EU: 'explore:region.EU',
  AS: 'explore:region.AS',
  AF: 'explore:region.AF',
  NA: 'explore:region.NA',
  SA: 'explore:region.SA',
  OC: 'explore:region.OC',
  AN: 'explore:region.AN',
}

export type ExploreScreenProps = {
  readonly world: WorldProgress | null
  /**
   * Opens a collection. Optional so the screenshot renderer and the component tests
   * can mount Explore without a router — the same reason every other callback here is.
   */
  readonly onOpenCollection?: ((kind: 'flags' | 'countries') => void) | undefined
  readonly loading: boolean
  readonly onSelectRegion: (region: RegionCode) => void
  /** The wallet, for the bar at the top. Absent draws the bar without it. */
  readonly coins?: number | undefined
  readonly onOpenInbox?: (() => void) | undefined
}

/**
 * Atlas beside the Explore heading.
 *
 * 84, against the 132 he gets on Home's quest card. That card is the one primary action
 * and he is half its subject; this is a heading he stands next to, and a mascot that
 * out-weighs the title of the screen he is decorating has stopped decorating it.
 */
const HEADER_ART = 84

/**
 * The globe on the world card.
 *
 * Big enough to read as a planet and not as an icon — below about 60 the continents on
 * it turn to noise — and small enough that the two progress bars beside it keep a
 * readable column at 320.
 */
const WORLD_GLOBE = 72

type TileSize = { readonly width: number; readonly height: number }

/** `width: '48%'` of the grid, which is the screen inside its own padding. */
const estimateTileWidth = (windowWidth: number) => (windowWidth - space[4] * 2) * 0.48

export function ExploreScreen({
  world,
  loading,
  onSelectRegion,
  onOpenCollection,
  coins,
  onOpenInbox,
}: ExploreScreenProps) {
  const t = useT()

  // All seven tiles are the same size, so one measurement serves them all. Seeded from
  // the window rather than from zero, so the first frame already has its sky instead of
  // flashing seven navy rectangles and then filling them in.
  const { width: windowWidth } = useWindowDimensions()
  /**
   * The grid's cell size, and the height of the TALLEST card in it.
   *
   * Height is a running maximum rather than the last card to report, which is what makes
   * the six cards one size: it is fed back as a `minHeight` on every tile, so the short
   * ones grow to meet the tall one instead of the tall one being cut down to fit. It
   * converges in a pass and cannot run away — a card held at the maximum measures as the
   * maximum, so the next round has nothing to raise.
   *
   * Measured rather than fixed because the text decides it, and how much text there is
   * depends on the translation and on the user's Dynamic Type setting. See `tile` in the
   * stylesheet for the two simpler answers that were tried and photographed failing.
   */
  const [tile, setTile] = useState({ width: estimateTileWidth(windowWidth), height: 0 })

  if (loading || world === null) return <ExploreSkeleton />

  const byRegion = new Map(world.regions.map((r) => [r.region, r]))

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TopBar
        initials="EX"
        {...(coins !== undefined ? { coins } : {})}
        {...(onOpenInbox !== undefined ? { onInbox: onOpenInbox } : {})}
      />
      {/* Atlas at screen level, beside the title.
   
          The reference puts its mascot in the Explore header holding a magnifying
          glass, and that placement answers a note `HomeScreen` has carried for a while:
          the character appeared on onboarding, welcome-back, five empty states, an
          error, a pause and an out-of-hearts card — every one of them a moment where
          something is missing or has gone wrong — which taught the user that seeing him
          is bad news. He now stands in two ordinary screens as well.
   
          `thinking` rather than `celebrate`: this is the browse tab, and the pose the
          brief calls "curious, not confused" is what a screen about where to go next
          wants. Decorative — the heading and its subtitle already say what the screen
          is, and a reader announcing a robot before them is length without meaning. */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} role="heading">
            {t('explore:title')}
          </Text>
          <Text style={styles.subtitle}>{t('explore:subtitle')}</Text>
        </View>
        {/* `explorer`, not `thinking`: he is standing on a rock looking out, which is
            what the reference has in this corner and what the screen is about. `thinking`
            is the mascot for a question and belongs on the ones that ask you something. */}
        <Art name="atlas/explorer" size={HEADER_ART} />
      </View>

      <Card style={styles.worldCard} accessibilityLabel={t('explore:world.label')}>
        {/* "Your world" is the card's TITLE, and it was being passed as the bar's label
            — so the bar printed "Your world   0 / 192" and the 192 went out unlabelled,
            directly above a labelled count of 65 countries. Two numbers, one described,
            and no way to tell that 192 is facts.

            Home's world card already does this correctly: a title, then a bar labelled
            with the facts phrase, then the countries line. The same data was presented
            two different ways on two screens, and this was the wrong one. */}
        {/* The globe, at last. `rewards/globe` was a delivered master that `build:art`
            had never rasterised — the third asset found in that state on this branch —
            and it is the one picture that says what this card is. Decorative: the
            heading and both counts already say it in words. */}
        <Art name="rewards/globe" size={WORLD_GLOBE} />
        <View style={styles.worldStats}>
          <Text style={styles.worldTitle}>{t('explore:world.label')}</Text>
          {/* Two counts, two bars. The facts line had a bar and the countries line did
              not, so the card answered "how far along am I?" for one of its two numbers
              and left the other as a sentence — which reads as the second one mattering
              less rather than as a layout choice. */}
          {/* `showPercent`, like the continent tiles below it.
   
              The card carried two bars with no figure on either, directly above six tiles
              that each print one — so the summary of the six was the only bar on the
              screen you had to eyeball. A percentage is also the one number that makes
              "347 facts" mean something to somebody who does not know how many there
              are. */}
          <ProgressBar
            current={world.factsLearned}
            total={Math.max(1, world.factsTotal)}
            showCount={false}
            showPercent
            label={t('explore:region.facts', {
              learned: world.factsLearned,
              total: world.factsTotal,
            })}
          />
          <ProgressBar
            current={world.entitiesComplete}
            total={Math.max(1, world.entitiesTotal)}
            showCount={false}
            label={t('explore:world.countries', {
              complete: world.entitiesComplete,
              total: world.entitiesTotal,
            })}
          />
        </View>
      </Card>

      {/* Collections sit ABOVE the continent grid deliberately. The grid is
          navigation — where do I go next — while these two answer "what do I have",
          which is the question that brings someone back on day nine. */}
      {onOpenCollection !== undefined && (
        <View style={styles.collections}>
          <Card
            level={2}
            role="button"
            accessibilityLabel={t('collection:flags.title')}
            onPress={() => onOpenCollection('flags')}
            style={styles.collection}
          >
            <Icon name="flag" size={22} color={colors.action.primary} />
            <View style={styles.collectionText}>
              <Text style={styles.collectionName}>{t('collection:flags.title')}</Text>
              <Text style={styles.collectionHint} numberOfLines={2}>
                {t('collection:flags.subtitle')}
              </Text>
            </View>
            {/* The affordance the tile was missing. Two cards that open a screen looked
                identical to the seven below them that also open a screen, and neither
                said so; a chevron is how iOS says "this goes somewhere". Decorative —
                the card's own role and label already announce it as a button. */}
            <Icon name="chevron" size={14} color={colors.text.tertiary} />
          </Card>
          <Card
            level={2}
            role="button"
            accessibilityLabel={t('collection:countries.title')}
            onPress={() => onOpenCollection('countries')}
            style={styles.collection}
          >
            <Icon name="explore" size={22} color={colors.action.primary} />
            <View style={styles.collectionText}>
              {/* Room, rather than a cap. Two tiles share 390pt with an icon and a
                  chevron each, and "Countries" broke as "Countrie / s" — a word split
                  mid-syllable, which is the one wrapping failure that reads as a bug.
                  `numberOfLines={1}` with `adjustsFontSizeToFit` was tried and is worse:
                  the prop is a no-op on react-native-web, so it ellipsised to
                  "Countri…" instead. The icon and chevron gave the space back. */}
              <Text style={styles.collectionName}>{t('collection:countries.title')}</Text>
              <Text style={styles.collectionHint} numberOfLines={2}>
                {t('collection:countries.subtitle')}
              </Text>
            </View>
            <Icon name="chevron" size={14} color={colors.text.tertiary} />
          </Card>
        </View>
      )}

      <View style={styles.grid}>
        {REGIONS.map((region, index) => (
          <ContinentTile
            key={region}
            region={region}
            index={index}
            progress={byRegion.get(region)}
            art={continentArtSize(tile.width, tile.height)}
            minHeight={tile.height}
            onSelect={onSelectRegion}
            onMeasure={setTile}
          />
        ))}
      </View>
    </ScrollView>
  )
}

/**
 * One continent, as its own component so it can hold a hook.
 *
 * It was inline in the grid's `.map` until the tiles needed a staggered entrance, and a
 * hook cannot be called from a loop body. Extracting it is the fix React asks for rather
 * than a workaround: seven tiles is seven components, and the one that animates is the
 * one that knows its own index.
 */
function ContinentTile({
  region,
  index,
  progress,
  art,
  minHeight,
  onSelect,
  onMeasure,
}: {
  readonly region: RegionCode
  readonly index: number
  readonly progress: WorldProgress['regions'][number] | undefined
  readonly art: number
  /** The tallest card measured so far, so all six settle on one height. See the parent. */
  readonly minHeight: number
  readonly onSelect: (region: RegionCode) => void
  readonly onMeasure: (next: (current: TileSize) => TileSize) => void
}) {
  const t = useT()
  const entrance = useStagger(index)
  const tint = palette.continent[region]
  const empty = progress === undefined || progress.factsTotal === 0
  const percent = `${Math.round((progress?.fraction ?? 0) * 100)}%`

  return (
    <Animated.View style={[styles.tileCell, staggerStyle(entrance)]}>
      <Pressable
        role="button"
        aria-label={t('explore:region.label', { region: t(REGION_NAME[region]), percent })}
        aria-disabled={empty}
        disabled={empty}
        onPress={() => onSelect(region)}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          // Guarded, because setting state from a layout that the state itself feeds is
          // how a render loop starts. Sub-point changes are noise.
          // Width from whoever reported last; height only ever upward. A card already
          // held at the maximum reports exactly the maximum, so this settles rather than
          // creeping — and a card that genuinely needs more (a longer translation, 200 %
          // text) raises it for the other five.
          onMeasure((current) =>
            Math.abs(current.width - width) < 1 && height <= current.height + 1
              ? current
              : { width, height: Math.max(current.height, height) },
          )
        }}
        // A continent with no content yet is dimmed rather than hidden. Hiding it would
        // read as a smaller world; dimming says "not yet".
        style={[
          styles.tile,
          { borderColor: tint },
          // The measured maximum, applied as a floor. `styles.tile` carries the seed for
          // the frame before anything has reported.
          minHeight > 0 && { minHeight },
          empty && styles.tileEmpty,
        ]}
      >
        {/* The continent's own sky, behind its card.
            This screen is the second tab of a geography app and had no picture on it at
            all — seven navy rectangles told apart by a 4pt coloured bar. The art is
            briefed per continent in asset-prompts.md §8 as atmosphere only: no landmass,
            no coastline, no borders, because a generated coastline is a wrong fact and a
            generated border is a political claim. Real Natural Earth geometry composites
            on top of this later.

            Decorative — the tile already announces the continent and its progress
            through `aria-label`, and a screen reader naming the weather over Asia is
            noise. */}
        <View style={styles.tileArt} pointerEvents="none">
          <Art name={CONTINENT_ART[region]} size={art} frame="bleed" />
          {/* A scrim, and it is not decoration. Four of these skies are bright —
              Africa's gold, South America's yellow-green, Oceania's turquoise — and text
              over them was unreadable, which is a WCAG AA failure the contrast gate
              cannot catch because it checks token PAIRS and this is text over a picture.

              It was a flat wash at 0.55 and that was measured, on the rendered tiles, as
              not enough: 1.5:1 on Oceania against a 4.5:1 floor. Raising the flat wash
              far enough for the worst sky would have flattened all seven back to navy.
              `ArtScrim` weights it downward instead, towards the small text, and leaves
              the top of the sky alone. */}
          <ArtScrim />
        </View>

        {/* The landmass, over the sky and under the words.
   
            Trailing edge and vertically centred, at a bit under half the tile, which is
            where the reference puts it: the text column keeps the leading half and the
            shape fills the space the copy does not use instead of sitting behind it.
            `pointerEvents` none on the wrapper above covers this too.
   
            Decorative. The tile's `aria-label` already names the continent and its
            progress, and a reader announcing "map of Africa" after "Africa, 0 %" is the
            same fact twice. */}
        {/* `bleed`, said out loud rather than left to `auto`.

            `auto` decides "is this a plate?" from how much of its file the subject
            covers, and the threshold assumes a cutout leaves margin. North America does
            not: knocked out, the landmass reaches all four edges — Alaska, Greenland,
            Panama — so it measures as whole-frame and `auto` would give it a panel's
            rounded border. Six continents drawn bare and one in a box.

            The measurement is right and the heuristic is out of its depth, which is the
            case `frame` exists for. A silhouette is a cutout by definition here, so all
            six say so rather than one of them being an exception. */}
        {CONTINENT_SILHOUETTE[region] !== undefined && (
          <View style={styles.tileShape} pointerEvents="none">
            <Art
              name={CONTINENT_SILHOUETTE[region]}
              size={art * SILHOUETTE_OF_TILE}
              frame="bleed"
            />
          </View>
        )}

        {/* The 6pt colour chip that used to sit here is gone.
            It predates the artwork: when every tile was a navy rectangle the swatch was
            the ONLY thing telling Europe from Asia. Now each card carries its continent's
            own sky and its own silhouette, and the border is already tinted — so the chip
            was a fourth statement of the same fact, stealing the first line of a card
            whose picture is the point. Reported from a device as a bar to remove. */}
        <Text style={styles.regionName}>{t(REGION_NAME[region])}</Text>

        {empty ? (
          <Text style={styles.regionMeta}>{t('explore:region.empty')}</Text>
        ) : (
          <>
            {/* The digits carry the emphasis, the words do not.
   
                Both references restyled this app and both did the same thing to every
                count on screen: "0 / 56 learned" sets the numbers brighter than the
                words around them. Ours drew the whole line in one colour, so the only
                numbers on the Explore screen had exactly the weight of the word
                "learned" — a caption where the reference has a score.
   
                `Tally` takes the ALREADY FORMATTED string and restyles the digit runs
                inside it, so where the numbers sit in the sentence stays a translator's
                decision. A component taking `{ learned, total }` would have to place
                the word itself, which is the concatenation rule with extra steps. */}
            <Tally style={styles.regionMeta} numberStyle={styles.regionMetaNumber}>
              {t('explore:region.progress', {
                learned: progress.factsLearned,
                total: progress.factsTotal,
              })}
            </Tally>
            {/* The progress bar that used to sit here is gone.

                Same reason as the chip above: it was the third thing on the card saying
                zero. "0 av 97 inlärda" is directly above it, and the bar added a rail, a
                fill of no width and a "0 %" — a percentage of a number already on screen.
                On a card at 0 % that is two empty shapes and a redundant digit occupying
                the half of the tile the map wants. Reported from a device as a bar to
                remove, and the count is the honest version of the same information.

                It stays on the REGION screen, where the same figure is the page's subject
                rather than one line of a six-up grid. */}
            {/* A pin, in the continent's own colour.
   
                ONE glyph tinted six ways, not six pictures. `Icon` renders Lucide's
                `map-pin` as a white-on-transparent alpha mask and recolours it at the
                call site, so the same 4 KB file serves every continent and follows the
                token if a tint ever changes — which six baked PNGs could not do, at any
                size, in any theme.
   
                Decorative: the line beside it says "19 countries to meet" in words. */}
            <View style={styles.regionDueRow}>
              <Icon name="pin" size={14} color={tint} />
              <Tally style={styles.regionDue} numberStyle={styles.regionMetaNumber}>
              {/* Zero due means "nothing is waiting for you", which is only true once
                  something has been learned. On a continent at 0 of 56 the same branch
                  rendered "Up to date" — an invitation turned into a claim that the user
                  had finished it.

                  The replacement for that was "Not started yet", which was the third
                  line on the tile to mean zero: under "0 of 56 learned" and an empty
                  bar, a caption saying nothing had started. The continent's SIZE is the
                  one number here a user does not already have, and it is the one that
                  makes an untouched tile look worth opening. */}
              {progress.factsLearned === 0
                ? t('explore:region.size', { count: progress.entitiesTotal })
                : t('explore:region.due', { count: progress.factsDue })}
            </Tally>
            </View>
          </>
        )}
      </Pressable>
    </Animated.View>
  )
}

function ExploreSkeleton() {
  const t = useT()
  return (
    <View style={styles.screen} aria-label={t('common:loading')}>
      <View style={styles.content}>
        <Skeleton width="45%" height={30} />
        <Skeleton height={88} borderRadius={radius.lg} />
        <View style={styles.grid}>
          {REGIONS.map((region) => (
            <Skeleton key={region} height={132} borderRadius={radius.lg} style={styles.tile} />
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  collections: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[4], marginBottom: space[3] },
  // A ROW, not a centred stack. The icon leads, the words explain, the chevron points
  // out — which is the shape of every navigation row iOS has ever drawn, and it fits a
  // subtitle without growing the tile.
  collection: {
    flex: 1,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  collectionText: { flex: 1, gap: space[0] },
  // Up a step from `caption`: it is a destination's name now, with its own line of
  // explanation under it, rather than a label under an icon.
  collectionName: { ...text('bodyStrong'), color: colors.text.primary },
  collectionHint: { ...text('caption'), color: colors.text.tertiary },
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  // A row now, with the mascot on the end. `space[1]` still separates the two lines of
  // text, which is why the gap moved inward rather than staying here.
  header: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  headerText: { flex: 1, gap: space[1] },
  title: { ...text('h1'), color: colors.text.primary },
  subtitle: { ...text('body'), color: colors.text.secondary },

  // A row now: globe, then the column of counts. `alignItems: 'center'` so the globe
  // sits against the middle of the stats rather than the top of the card.
  worldCard: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  worldStats: { flex: 1, gap: space[2] },
  worldTitle: { ...text('h3'), color: colors.text.primary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  // Clipped, so the oversized background stops at the card edge, and positioned so
  // the swatch, name and progress stack on top of it.
  tileArt: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // `end`, not `right`: the text column is the leading half and it mirrors in RTL, so a
  // shape pinned to a physical edge would sit on the copy in Arabic.
  /**
   * Bottom-trailing, and quiet.
   *
   * `end` rather than `right`: the copy is the leading column and it mirrors in RTL, so
   * a shape pinned to a physical edge would sit on the text in Arabic. The offsets push
   * it past the corner so the landmass bleeds off two edges instead of floating in the
   * middle of the card with air all round it.
   *
   * 0.55 opacity is the number that lets `text.primary` keep its 4.5:1 over the brightest
   * of the six — Africa's gold — with `ArtScrim` already weighted downward underneath it.
   * At full strength the map won and the count was unreadable on three of the seven.
   */
  // `space[1]` is the icon↔label step — the one place the 4pt rung is for.
  regionDueRow: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  tileShape: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    opacity: 0.55,
  },
  // The cell owns the grid width; the tile fills the cell. Split when the tiles gained a
  // staggered entrance — the transform has to sit on a wrapper, because animating the
  // Pressable itself would fight `press3d` for the same transform property.
  tileCell: { width: '48%' },
  tile: {
    width: '100%',
    gap: space[2],
    padding: space[3],
    /**
     * The floor every card starts from. The one they SETTLE on is measured — see
     * `tallestTile` and the `minHeight` applied at the call site.
     *
     * A fixed height was tried first and is the wrong answer, which is worth recording
     * because it looks like the obvious one. `minHeight` equalises the two cards in a
     * row (flex stretches a wrapped line to its tallest) and does nothing across rows, so
     * on a device the Europe/Asia row stood taller than the ones beneath it — "19 länder
     * att upptäcka" wraps and "7 länder att upptäcka" does not. Pinning `height: 148`
     * made all six identical and clipped every one of them at 200 % text, which `pnpm
     * e2e` caught: `clipped "19" · clipped "14" · clipped "16"`.
     *
     * Scaling the number by `fontScale` is the textbook fix and does not work here
     * either: `PaywallScreen` already records that react-native-web reports `fontScale`
     * as 1 whatever the user set, so it would fix the device and leave the harness — and
     * every browser user — clipped.
     */
    minHeight: 148,
    borderRadius: radius.lg,
    ...squircle,
    borderWidth: 1,
    // Clips the oversized continent background to the card.
    overflow: 'hidden',
    backgroundColor: colors.bg.surface,
  },
  tileEmpty: { opacity: 0.45 },
  regionName: { ...text('h3'), color: colors.text.primary },
  regionMeta: { ...text('caption'), color: colors.text.secondary },
  // Same size, brighter and heavier. `numeric` for tabular figures so a column of
  // tiles does not jitter between "0 of 56" and "12 of 56".
  regionMetaNumber: {
    ...text('caption', { weight: '700', numeric: true }),
    color: colors.text.primary,
  },
  // `secondary`, not `tertiary`. The contrast matrix records tertiary as large-text
  // only — it clears 3:1 and not 4.5:1 — and this is a 13pt caption. It was wrong on a
  // plain surface before it was ever put over a picture; the artwork only made it
  // visible.
  /**
   * `flex: 1`, and it is a bug fix rather than a tidy-up.
   *
   * The row is `flexDirection: 'row'` with a pin beside it, and a Text in a row with no
   * flex does not wrap — it lays out at its natural width and overflows the parent. On a
   * device "7 länder att upptäcka" ran off the card's right edge with the final letters
   * clipped by the border, on three of the six tiles. It looked like a truncation bug
   * and was a flex bug: nothing had told the text it was allowed to be narrower than its
   * content.
   */
  regionDue: { ...text('caption'), color: colors.text.secondary, flex: 1 },
})
