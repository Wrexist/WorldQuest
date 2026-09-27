import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, radius, space, text } from '@worldquest/design'
import { BALANCE } from '@worldquest/engines'
import { AdventureArt } from '../../../components/AdventureArt.js'
import { RewardMotion } from '../../../components/RewardMotion.js'
import { Icon } from '../../../components/Icon.js'
import { tContent, useT } from '../../../lib/i18n.js'
import type { PathNodeView, PathUnitView } from '../pathView.js'
import { PathNode } from './PathNode.js'

type Props = {
  unit: PathUnitView; width: number; total: number; open: string | null
  onPress: (node: PathNodeView) => void; onPractise: (id: string) => void
  onCurrentLayout: (y: number, height: number) => void
}

/** A vertical course of raised platforms. Artwork lives beside the path, never behind it. */
export function PlatformUnit({ unit, width, total, open, onPress, onPractise, onCurrentLayout }: Props) {
  const t = useT()
  const title = tContent(unit.titleKey)
  const [pathTop, setPathTop] = useState(0)
  return <View style={styles.unit} testID="path-unit">
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.overline}>{t('home:path.unit', { number: unit.number })}</Text>
        <Icon name="globe" size={space[5]} color={colors.course.bannerInk} />
      </View>
      <View accessible role="heading" aria-label={t('home:path.unit.heading', { number: unit.number, title })}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.count}>{t('home:path.unit.progress', { done: unit.done, total: unit.nodes.length })}</Text>
      <View style={styles.unitTrack} aria-hidden>
        {unit.nodes.map(step => <View key={step.id} style={[styles.unitSegment, step.state === 'done' && styles.unitSegmentDone, step.state === 'current' && styles.unitSegmentCurrent]} />)}
      </View>
    </View>
    <View style={styles.path} onLayout={e => setPathTop(e.nativeEvent.layout.y)}>
      {unit.nodes.map((node, index) => <PlatformStop key={node.id} node={node} index={index} width={width} total={total} open={open} onPress={onPress} onPractise={onPractise} onCurrentLayout={(y, height) => onCurrentLayout(pathTop + y, height)} />)}
    </View>
  </View>
}

function PlatformStop({ node, index, width, total, open, onPress, onPractise, onCurrentLayout }: Omit<Props, 'unit'> & { node: PathNodeView; index: number }) {
  const t = useT()
  const current = node.state === 'current'
  const selected = open === node.id
  const showAction = current && open === null
  const [layout, setLayout] = useState<{ y: number; height: number } | null>(null)
  // The winding sequence stays within the thumb's reach on the narrowest phone.
  const swing = [0, .18, .25, .12, -.12, -.25][index % 6]!
  const center = width * .44 + swing * Math.min(width, 360)
  useEffect(() => {
    if (layout && (selected || showAction)) onCurrentLayout(layout.y, layout.height)
  }, [node.id, selected, showAction, layout, onCurrentLayout])
  return <View style={styles.stop} onLayout={e => setLayout(e.nativeEvent.layout)}>
    <View style={[styles.platformRow, !current && styles.upcomingRow]}>
      <View style={{ position: 'absolute', start: center - 40, top: space[4], width: 80 }} testID={`trail-stop-${node.position}`}>
        <PathNode node={node} total={total} swing={0} column={80} expanded={selected} onPress={() => onPress(node)} compact />
      </View>
      {current && <View pointerEvents="none" aria-hidden testID="trail-guide" dataSet={{ step: node.id }} style={[styles.guide, { start: center < width / 2 ? width - 112 : space[2] }]}>
        <AdventureArt name="explorer" mood="welcome" style={styles.explorer} />
        <View style={styles.guideGround} />
      </View>}
    </View>
    {showAction && <View style={styles.actionWrap} testID="trail-next">
      <View pointerEvents="none" aria-hidden style={[styles.tail, { start: center - space[2] }]} />
      <View style={styles.action}>
        <View style={styles.rewardRow}>
          <Text style={styles.lesson}>{t('home:path.lesson', { lesson: Math.min(node.finished + 1, node.lessons), lessons: node.lessons })}</Text>
          <View style={styles.xpBadge}>
            <RewardMotion><Icon name="star" size={space[5]} color={colors.reward.coin} /></RewardMotion>
            <Text style={styles.xpValue}>{t('home:path.xp', { amount: BALANCE.xp.correctAnswer })}</Text>
          </View>
        </View>
        <Text style={styles.objective}>{tContent(node.objectiveKey, { count: node.count })}</Text>
        <Text style={styles.rewardHint}>{t('home:path.xp.detail')}</Text>
        <Button variant="discovery" label={t(node.finished > 0 ? 'home:path.continueChallenge' : 'home:path.startChallenge')} accessibilityHint={tContent(node.objectiveKey, { count: node.count })} onPress={() => onPress(node)} />
      </View>
    </View>}
    {selected && <Card testID="path-card" style={styles.inspection}>
      <Text style={styles.inspectTitle}>{tContent(node.objectiveKey, { count: node.count })}</Text>
      <Text style={styles.inspectBody}>{t(node.state === 'done' ? 'home:path.done.body' : 'home:path.locked.body')}</Text>
      {node.state === 'done' && <Button label={t('home:path.practise')} variant="secondary" onPress={() => onPractise(node.id)} testID="path-practise" />}
    </Card>}
  </View>
}

const styles = StyleSheet.create({
  unit: { gap: space[2] },
  header: { backgroundColor: colors.course.banner, borderRadius: radius.xl, borderBottomWidth: space[2], borderColor: colors.course.bannerEdge, padding: space[4], gap: space[1] },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overline: { ...text('overline'), color: colors.course.bannerInk },
  title: { ...text('h2'), color: colors.course.bannerInk },
  count: { ...text('caption'), color: colors.course.bannerInk },
  unitTrack: { flexDirection: 'row', gap: space[1], marginTop: space[2] },
  unitSegment: { flex: 1, height: space[2], borderRadius: radius.full, backgroundColor: colors.course.bannerEdge },
  unitSegmentDone: { backgroundColor: colors.action.primaryFace },
  unitSegmentCurrent: { backgroundColor: colors.course.face },
  rewardRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: space[1], backgroundColor: colors.journey.sand, paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.full },
  xpValue: { ...text('bodyStrong', { numeric: true }), color: colors.text.primary },
  rewardHint: { ...text('caption'), color: colors.course.bannerInk },
  path: { gap: space[1] },
  stop: { gap: space[2], paddingBottom: space[1] },
  platformRow: { height: 112 },
  upcomingRow: { height: 96 },
  guide: { position: 'absolute', top: -space[1], width: 104, alignItems: 'center' },
  explorer: { width: 96, height: 112 },
  guideGround: { width: space[8], height: space[2], borderRadius: radius.full, backgroundColor: colors.course.track, opacity: .5, marginTop: -space[2], zIndex: -1 },
  actionWrap: { marginBottom: 0 },
  tail: { position: 'absolute', top: -space[2], width: space[4], height: space[4], transform: [{ rotate: '45deg' }], backgroundColor: colors.course.banner },
  action: { backgroundColor: colors.course.banner, borderRadius: radius.xl, padding: space[3], gap: space[2], borderBottomWidth: space[1], borderColor: colors.course.bannerEdge },
  lesson: { ...text('caption', { weight: '700' }), color: colors.course.bannerInk },
  objective: { ...text('h3'), color: colors.course.bannerInk },
  inspection: { gap: space[2] },
  inspectTitle: { ...text('bodyStrong'), color: colors.text.primary },
  inspectBody: { ...text('body'), color: colors.text.secondary },
})
