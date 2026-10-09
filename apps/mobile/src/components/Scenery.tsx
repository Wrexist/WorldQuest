/**
 * Decorative scenery: a unit's picture above its banner, and the props that float beside
 * the path. Every name maps to art already in the app; none of it is a map, a flag or a
 * real coastline (`docs/design/asset-prompts.md`), so none of it can be a wrong fact.
 *
 * Scenery is hidden from assistive technology. A scene may opt interactive foreground
 * children into the reading order; the landscape itself stays decorative.
 */
import type { ReactNode } from 'react'
import { Animated, Image, Platform, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'
import { createThemeStyles, driftStyle, radius, space, useTheme } from '@worldquest/design'
import { ramp } from './ScrollEdges.js'
import { useSceneDrift } from '../hooks/useSceneDrift.js'
import { ADVENTURE_ART } from '../lib/adventure.generated.js'
import { EXPEDITION_ART } from '../lib/expedition.generated.js'

type Scene = {
  readonly source: unknown
  readonly fit: 'cover' | 'contain'
  /** The continent a scene stands for. Its identity colour tints the unit (`unitTint`). */
  readonly region?: 'EU' | 'AS' | 'AF' | 'NA' | 'SA' | 'OC' | 'AN'
}

/** Names a course pack may use (`scenery` in pack.schema.json lists the same ones). */
const SCENES = {
  'island': { source: ADVENTURE_ART['island'], fit: 'cover' },
  'discovery-island': { source: EXPEDITION_ART['discovery-island'].asset, fit: 'contain' },
  'europe': { source: ADVENTURE_ART['europe'], fit: 'cover', region: 'EU' },
  'asia': { source: ADVENTURE_ART['asia'], fit: 'cover', region: 'AS' },
  'africa': { source: ADVENTURE_ART['africa'], fit: 'cover', region: 'AF' },
  'north-america': { source: ADVENTURE_ART['north-america'], fit: 'cover', region: 'NA' },
  'south-america': { source: ADVENTURE_ART['south-america'], fit: 'cover', region: 'SA' },
  'oceania': { source: ADVENTURE_ART['oceania'], fit: 'cover', region: 'OC' },
  'antarctica': { source: ADVENTURE_ART['antarctica'], fit: 'cover', region: 'AN' },
} as const satisfies Record<string, Scene>

export type SceneryName = keyof typeof SCENES

/** Own keys only: a pack naming `constructor` draws nothing rather than a prototype. */
export function isSceneryName(name: string | undefined): name is SceneryName {
  return name !== undefined && Object.prototype.hasOwnProperty.call(SCENES, name)
}

/**
 * The continent a scene stands for, or nothing. The islands of the first week are not
 * about one continent, so their units keep the plain sky.
 */
export function sceneryRegion(name: SceneryName): Scene['region'] {
  const scene: Scene = SCENES[name]
  return scene.region
}

const toSource = (source: unknown): ImageSourcePropType =>
  (typeof source === 'string' ? { uri: source } : source) as ImageSourcePropType

const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const

/**
 * A unit's picture, full width. A painted scene fills the frame; a free-standing island
 * floats on a plain sky of its own, drifting — its art carries its own clouds, and flat
 * drawn ones beside them read as placeholder bars.
 */
export function SceneryBanner({ name, height, style, rounded = 'top', children, interactiveChildren = false }: {
  name: SceneryName; height: number; style?: StyleProp<ViewStyle>
  /** `top` sits on a banner's plate; `all` stands alone as a card. */
  rounded?: 'top' | 'all'
  /** Whoever stands in the scene (Atlas), feet on its lower edge. */
  children?: ReactNode
  /** Keeps foreground controls reachable while the scenery remains decorative. */
  interactiveChildren?: boolean
}) {
  const { styles } = useThemeValues()
  const scene = SCENES[name]
  const drift = useSceneDrift(0.3, scene.fit === 'contain' && children === undefined)
  const frame = [styles.frame, rounded === 'all' && styles.frameAll, { height }, style]
  const sceneAccessibility = interactiveChildren ? { pointerEvents: 'box-none' as const } : { ...hidden, pointerEvents: 'none' as const }
  const foreground = children === undefined ? null : <View style={styles.foreground}>{children}</View>
  if (scene.fit === 'cover') {
    // Explicit size, not absoluteFill: on the web an Image positioned by its edges alone
    // falls back to the file's own pixels and shows its top-left corner.
    const image = <View {...hidden} pointerEvents="none" style={styles.fill}>
      <Image {...hidden} source={toSource(scene.source)} resizeMode="cover" style={styles.fill} alt="" />
    </View>
    return <View {...sceneAccessibility} testID={`scenery-${name}`} style={frame}>
      {rounded === 'top' ? <Dissolve height={height}>{image}</Dissolve> : image}
      {foreground}
    </View>
  }
  return <View {...sceneAccessibility} testID={`scenery-${name}`} style={[...frame, styles.sky]}>
    {children === undefined
      ? <Animated.View {...hidden} pointerEvents="none" style={[styles.island, driftStyle(drift, space[2])]}>
          <Image source={toSource(scene.source)} resizeMode="contain" style={{ width: height * 1.1, height: height * 1.1 }} alt="" />
        </Animated.View>
      : <IslandStage size={height * .96}>{children}</IslandStage>}
  </View>
}

/**
 * The floating island as a stage: it drifts behind, and whoever stands in `children`
 * (Atlas, on the lesson summary) stays still in front of it, feet on the grass line.
 */
export function IslandStage({ size, children }: { size: number; children: ReactNode }) {
  const drift = useSceneDrift(0.6)
  const island = size * ISLAND_SHARE
  // The island sits at the bottom of the square and whoever stands on it plants their
  // feet on its lawn, half way up the art — not in front of it, which read as a face
  // pasted over a picture. Callers keep the figure under about half the square.
  return <View style={{ width: size, height: size, alignItems: 'center' }}>
    <Animated.View {...hidden} pointerEvents="none" testID="island-stage" style={[{ position: 'absolute', bottom: 0 }, driftStyle(drift, space[1])]}>
      <Image source={toSource(EXPEDITION_ART['discovery-island'].asset)} resizeMode="contain" style={{ width: size, height: island }} alt="" />
    </Animated.View>
    <View style={{ position: 'absolute', bottom: island * LAWN, alignItems: 'center' }}>{children}</View>
  </View>
}

/** How much of the stage's height the island takes, and where its lawn is (from its foot). */
const ISLAND_SHARE = .78
const LAWN = .56

/** Props that stand beside the path. Chosen for being places and tools, never rewards. */
export const PATH_PROPS = ['discovery-island', 'compass', 'passport'] as const
export type PathProp = (typeof PATH_PROPS)[number]

/** One prop beside the path, drifting on its own phase so neighbours never bob in step. */
export function FloatingProp({ name, size, phase, style }: { name: PathProp; size: number; phase: number; style?: StyleProp<ViewStyle> }) {
  const drift = useSceneDrift(phase)
  return <Animated.View {...hidden} pointerEvents="none" testID={`path-prop-${name}`} style={[style, driftStyle(drift, space[2])]}>
    <Image source={toSource(EXPEDITION_ART[name].asset)} resizeMode="contain" style={{ width: size, height: size }} alt="" />
  </Animated.View>
}

/** How far up from its lower edge a banner's scene melts into the plate it sits on. */
const DISSOLVE = space[6]

/**
 * A scene on a plate ends in a dissolve, not a line: its last `DISSOLVE` points fade out
 * on an eased ramp, so the plate's own colour shows through. It was a hard horizontal
 * edge, a bright landscape straight into a dark card (owner review, 2026-10-10: "no hard
 * lines"). The scene itself fades, through a mask, rather than having a colour laid
 * over it: the plate is clay plus a continent tint, and no single colour would match it.
 * Not on the web, where the mask library draws the mask instead of the scene.
 */
function Dissolve({ height, children }: { height: number; children: ReactNode }) {
  const { colors } = useTheme()
  if (Platform.OS === 'web') return <>{children}</>
  const fade = ramp(colors.bg.canvas, 'top')
  const from = 1 - Math.min(1, DISSOLVE / Math.max(height, 1))
  // Solid down to `from`, then the eased ramp to clear at the bottom.
  const mask = {
    colors: [fade.colors[0], ...fade.colors] as [string, string, ...string[]],
    locations: [0, ...fade.locations.map(at => from + at * (1 - from))] as [number, number, ...number[]],
  }
  return <MaskedView pointerEvents="none" style={StyleSheet.absoluteFill} maskElement={<LinearGradient {...mask} style={StyleSheet.absoluteFill} />}>
    {children}
  </MaskedView>
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    frame: { width: '100%', overflow: 'hidden', borderTopStartRadius: radius.xl, borderTopEndRadius: radius.xl },
    frameAll: { borderRadius: radius.xl },
    foreground: { position: 'absolute', start: 0, end: 0, bottom: space[2], alignItems: 'center' },
    sky: { backgroundColor: colors.journey.sky, alignItems: 'center', justifyContent: 'center' },
    fill: { position: 'absolute', top: 0, start: 0, width: '100%', height: '100%' },
    island: { marginTop: space[3] },
  })
  return { colors, styles }
})
