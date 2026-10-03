import { createThemeStyles } from '@worldquest/design'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Button, Card, ClaySurface, radius, space, text } from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { AdventureArt } from '../../../components/AdventureArt.js'
import { CloudBackdrop } from '../../../components/CloudBackdrop.js'
import { FloatingProp, PATH_PROPS, SceneryBanner, isSceneryName } from '../../../components/Scenery.js'
import { HeaderJewel } from '../../../components/HeaderJewel.js'
import { RewardMotion } from '../../../components/RewardMotion.js'
import { SceneEntrance } from '../../../components/SceneEntrance.js'
import { Icon } from '../../../components/Icon.js'
import { tContent, useT } from '../../../lib/i18n.js'
import type { PathNodeView, PathUnitView } from '../pathView.js'
import { PathNode } from './PathNode.js'

type Props = {
  unit: PathUnitView; width: number; total: number; open: string | null
  onPress: (node: PathNodeView) => void; onPractise: (id: string) => void
  onCurrentLayout: (y: number, height: number) => void
}

/**
 * A vertical course of raised platforms. Artwork lives beside the path, never behind it:
 * the unit's scenery sits above its banner, and props float in the space the winding
 * path leaves empty, so nothing ever lies under a step or its label.
 */
export function PlatformUnit({ unit, width, total, open, onPress, onPractise, onCurrentLayout }: Props) {
  const { styles } = useThemeValues()
  const t = useT()
  const { fontScale } = useWindowDimensions()
  const title = tContent(unit.titleKey)
  const [pathTop, setPathTop] = useState(0)
  const scenery = isSceneryName(unit.scenery) ? unit.scenery : null
  // Tall enough to be a place, short enough that the first step still shows on an SE.
  const sceneHeight = fontScale > 1.3 ? space[9] + space[5] : Math.round(Math.min(Math.max(width * .4, 120), 176))
  return <View style={styles.unit} testID="path-unit">
    <View style={[styles.header, scenery !== null && styles.headerScenic]}>
      <ClaySurface tone="sky" radius={radius.xl} />
      {scenery !== null && <SceneryBanner name={scenery} height={sceneHeight} />}
      <View style={[styles.headerBody, scenery === null && styles.headerBodyPlain]}>
      <View style={styles.headerTop}>
        <View style={styles.headerWords}>
          <Text style={styles.overline}>{t('home:path.unit', { number: unit.number })}</Text>
          <View accessible role="heading" aria-label={t('home:path.unit.heading', { number: unit.number, title })}>
            <Text style={styles.title}>{title}</Text>
          </View>
        </View>
        {scenery === null && width >= 340 && fontScale <= 1.3 && <HeaderJewel name="globe" size={64} />}
      </View>
      <Text style={styles.count}>{tContent(unit.objectiveKey)}</Text>
      <Text style={styles.count}>{t('home:path.unit.progress', { done: unit.done, total: unit.nodes.length })}</Text>
      <View style={styles.unitTrack} aria-hidden>
        {unit.nodes.map(step => <View key={step.id} testID={`unit-progress-${step.id}`} dataSet={{ completed: String(step.state === 'done') }} style={[styles.unitSegment, step.state === 'done' && styles.unitSegmentDone]} />)}
      </View>
      </View>
    </View>
    <View style={styles.path} onLayout={e => setPathTop(e.nativeEvent.layout.y)}>
      {unit.nodes.map((node, index) => <PlatformStop key={node.id} node={node} index={index} width={width} total={total} open={open} onPress={onPress} onPractise={onPractise} onCurrentLayout={(y, height) => onCurrentLayout(pathTop + y, height)} />)}
    </View>
  </View>
}

function PlatformStop({ node, index, width, total, open, onPress, onPractise, onCurrentLayout }: Omit<Props, 'unit'> & { node: PathNodeView; index: number }) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const current = node.state === 'current'
  const selected = open === node.id
  const showAction = current && open === null
  const [layout, setLayout] = useState<{ y: number; height: number } | null>(null)
  // The winding sequence stays within the thumb's reach on the narrowest phone.
  const swing = [0, .18, .25, .12, -.12, -.25][index % 6]!
  const center = width * .44 + swing * Math.min(width, 360)
  const prop = sceneryBeside(index, current, center, width)
  useEffect(() => {
    if (layout && (selected || showAction)) onCurrentLayout(layout.y, layout.height)
  }, [node.id, selected, showAction, layout, onCurrentLayout])
  return <View style={styles.stop} onLayout={e => setLayout(e.nativeEvent.layout)}>
    <View style={[styles.platformRow, !current && styles.upcomingRow]}>
      {prop !== null && <FloatingProp name={prop.name} size={prop.size} phase={(index % 3) / 3} style={{ position: 'absolute', top: space[2], start: prop.start }} />}
      <View style={{ position: 'absolute', start: center - 40, top: space[4], width: 80 }} testID={`trail-stop-${node.position}`}>
        <PathNode node={node} total={total} swing={0} column={80} expanded={selected} onPress={() => onPress(node)} compact />
      </View>
      {current && <View pointerEvents="box-none" testID="trail-guide" dataSet={{ step: node.id }} style={[styles.guide, { start: center < width / 2 ? width - 112 : space[2] }]}>
        <CloudBackdrop style={styles.guideClouds} />
        {/* The one Atlas you can poke: tap him and he laughs. A button with a name, so a
            screen reader meets it as the small game it is rather than as a picture. */}
        <AdventureArt name="explorer" mood="welcome" style={styles.explorer} boopLabel={t('home:path.guide.boop')} />
      </View>}
    </View>
    {showAction && <View style={styles.actionWrap} testID="trail-next">
      <View pointerEvents="none" aria-hidden style={[styles.tail, { start: center - space[2] }]} />
      <View style={styles.action}>
        <ClaySurface radius={radius.xl} />
        <View style={styles.rewardRow}>
          <Text style={styles.lesson}>{t('home:path.lesson', { lesson: Math.min(node.finished + 1, node.lessons), lessons: node.lessons })}</Text>
          <View style={styles.xpBadge}>
            <ClaySurface tone="gold" radius={radius.full} />
            <RewardMotion><Icon name="star" size={space[5]} color={colors.reward.coin} /></RewardMotion>
            <Text style={styles.xpValue}>{t('home:path.xp', { amount: BALANCE.xp.correctAnswer })}</Text>
          </View>
        </View>
        <Text style={styles.objective}>{tContent(node.objectiveKey, { count: node.count })}</Text>
        <Text style={styles.rewardHint}>{t('home:path.xp.detail')}</Text>
        <Button variant="discovery" label={t(node.finished > 0 ? 'home:path.continueChallenge' : 'home:path.startChallenge')} accessibilityHint={tContent(node.objectiveKey, { count: node.count })} onPress={() => onPress(node)} />
      </View>
    </View>}
    {selected && <SceneEntrance replayKey={node.id}><Card testID="path-card" style={styles.inspection}>
      <Text style={styles.inspectTitle}>{tContent(node.objectiveKey, { count: node.count })}</Text>
      <Text style={styles.inspectBody}>{t(node.state === 'done' ? 'home:path.done.body' : 'home:path.locked.body')}</Text>
      {node.fading === true && <Text style={styles.inspectBody} testID="path-fading-note">{t('home:path.fading')}</Text>}
      {node.state === 'done' && <Button label={t('home:path.practise')} variant="secondary" onPress={() => onPractise(node.id)} testID="path-practise" />}
    </Card></SceneEntrance>}
  </View>
}



/**
 * A prop for every third step, on the side the path swings away from, centred in the
 * room left there. Never beside the current step: Atlas stands there. Nothing when the
 * room is narrower than the smallest prop, as on a 320 pt phone at a mid swing.
 */
function sceneryBeside(index: number, current: boolean, center: number, width: number) {
  if (current || index % 3 !== 1) return null
  const name = PATH_PROPS[Math.floor(index / 3) % PATH_PROPS.length]!
  const size = name === 'discovery-island' ? 104 : 72
  const node = 40 + space[3]
  const [from, to] = center < width / 2 ? [center + node, width] : [0, center - node]
  if (to - from < size) return null
  return { name, size, start: Math.round(from + (to - from - size) / 2) }
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  unit: { gap: space[2] },
  header: { backgroundColor: colors.clay.sky.bottom, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.clay.sky.rim, overflow: 'hidden' },
  headerScenic: { borderWidth: 1 },
  headerBody: { padding: space[4], paddingTop: space[3], gap: space[1] },
  headerBodyPlain: { paddingTop: space[4] },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  headerWords: { flex: 1, gap: space[1] },
  overline: { ...text('overline'), color: colors.clay.sky.muted },
  title: { ...text('h2'), color: colors.clay.sky.ink },
  count: { ...text('caption'), color: colors.clay.sky.muted },
  unitTrack: { flexDirection: 'row', gap: space[1], marginTop: space[2] },
  unitSegment: { flex: 1, height: space[2], borderRadius: radius.full, backgroundColor: colors.course.bannerEdge },
  unitSegmentDone: { backgroundColor: colors.action.primaryFace },
  rewardRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: space[1], backgroundColor: colors.journey.sand, paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.full },
  xpValue: { ...text('bodyStrong', { numeric: true }), color: colors.clay.gold.ink },
  rewardHint: { ...text('caption'), color: colors.text.secondary },
  path: { gap: space[1] },
  stop: { gap: space[2], paddingBottom: space[1] },
  platformRow: { height: 112 },
  upcomingRow: { height: 96 },
  guide: { position: 'absolute', top: -space[1], width: 104, alignItems: 'center' },
  guideClouds: { start: -space[3], end: -space[3], height: space[8] },
  explorer: { width: space[9] + space[7], height: space[9] + space[7] },
  actionWrap: { marginBottom: 0 },
  tail: { position: 'absolute', top: -space[2], width: space[4], height: space[4], transform: [{ rotate: '45deg' }], backgroundColor: colors.clay.ice.top },
  action: { backgroundColor: colors.bg.surface, borderRadius: radius.xl, padding: space[3], gap: space[2], borderWidth: 1, borderColor: colors.clay.ice.rim },
  lesson: { ...text('caption', { weight: '700' }), color: colors.text.secondary },
  objective: { ...text('h3'), color: colors.text.primary },
  inspection: { gap: space[2] },
  inspectTitle: { ...text('bodyStrong'), color: colors.text.primary },
  inspectBody: { ...text('body'), color: colors.text.secondary },
})
  return { colors, styles }
})
