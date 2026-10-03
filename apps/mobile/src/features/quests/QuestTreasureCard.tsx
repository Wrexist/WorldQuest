import { Fragment, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Card, ClaySurface, clayShadow, createThemeStyles, layout, radius, space, text, useCelebration } from '@worldquest/design'
import { COMPLETION_BONUS, questProgress, type DailyQuest } from '@worldquest/engines'
import { Icon } from '../../components/Icon.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'
import { hapticSelect } from '../../lib/haptics.js'
import { useT } from '../../lib/i18n.js'
import { ExplorerChestArt } from '../../components/ExplorerChestArt.js'

const CHEST_SIZE = space[9] + space[7] + space[4]
const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }

/** A reward preview. Only the quest engine can complete tasks or award its bonus. */
export function QuestTreasureCard({ quest }: { quest: DailyQuest }) {
  const { styles } = useThemeValues()
  const t = useT()
  const { done, total } = questProgress(quest)
  const { width, fontScale } = useWindowDimensions()
  const stacked = width / fontScale < layout.minWidth

  return <SceneEntrance>
    <Card tone="navy" testID="quest-treasure-card" style={styles.card}>
      <View style={[styles.scene, stacked && styles.sceneStacked]}>
        <View style={[styles.copy, stacked && styles.copyStacked]}>
          <Text style={styles.title}>{t(quest.complete ? 'quests:complete.title' : 'quests:treasure.title')}</Text>
          <Text style={styles.rewardText}>{t('quests:reward.task', { xp: COMPLETION_BONUS })}</Text>
          <Text style={styles.body}>{t(quest.complete ? 'quests:complete.body' : 'quests:treasure.unlock')}</Text>
        </View>
        <QuestChest complete={quest.complete} done={done} />
      </View>

      <View style={styles.journey}>
        <Text style={styles.progressText}>{t('quests:progress', { done, total })}</Text>
        <View testID="quest-progress" role="progressbar"
          aria-label={t('quests:progress', { done, total })}
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} style={styles.trail}>
          {quest.tasks.map((task, index) => <Fragment key={task.slot}>
            {index > 0 && <View {...hidden} style={[styles.connector, task.complete && quest.tasks[index - 1]?.complete && styles.connectorDone]} />}
            <QuestCheckpoint complete={task.complete} step={index + 1} />
          </Fragment>)}
        </View>
      </View>
    </Card>
  </SceneEntrance>
}

/** Stamp newly finished tasks; restored checkpoints stay at rest. */
function QuestCheckpoint({ complete, step }: { complete: boolean; step: number }) {
  const { colors, styles } = useThemeValues()
  const scale = useCelebration(complete, complete)
  return <Animated.View {...hidden} testID={`quest-milestone-${step}`}
    style={[styles.milestone, { transform: [{ scale }] }]}>
    <ClaySurface tone={complete ? 'lime' : 'sky'} radius={radius.full} />
    {complete
      ? <Icon name="check" size={space[5]} color={colors.clay.lime.ink} />
      : <Text style={styles.number}>{step}</Text>}
  </Animated.View>
}

/** Tap gives a small physical nudge; the lid opens only after real completion. */
function QuestChest({ complete, done }: { complete: boolean; done: number }) {
  const { styles } = useThemeValues()
  const t = useT()
  const [nudges, setNudges] = useState(0)

  return <Pressable role="button" testID="quest-chest" aria-label={t('quests:treasure.nudge')}
    onPress={() => { hapticSelect(); setNudges(value => value + 1) }}
    style={({ pressed }) => [styles.chestButton, pressed && styles.chestPressed]}>
    <ExplorerChestArt size={CHEST_SIZE} opened={complete} nudge={done + nudges} />
    <View {...hidden} style={styles.hintSurface}><ClaySurface tone="navy" radius={radius.full} /><Text style={styles.tapHint}>{t('quests:treasure.tap')}</Text></View>
  </Pressable>
}

const useThemeValues = createThemeStyles(colors => ({ colors, styles: StyleSheet.create({
  card: { borderRadius: radius['2xl'], overflow: 'hidden', padding: space[3], gap: space[3] },
  scene: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  sceneStacked: { flexDirection: 'column', alignItems: 'stretch' },
  copy: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space[1] },
  copyStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  title: { ...text('bodyStrong'), color: colors.chrome.text },
  rewardText: { ...text('h1', { weight: '800', numeric: true }), color: colors.league.gold.end, flexShrink: 1 },
  body: { ...text('caption'), color: colors.clay.navy.muted },
  chestButton: { alignSelf: 'center', alignItems: 'center', flexShrink: 0, borderRadius: radius.lg, paddingBottom: space[1] },
  chestPressed: { backgroundColor: colors.chrome.counter },
  hintSurface: { ...clayShadow(colors), borderRadius: radius.full, paddingHorizontal: space[2], paddingVertical: space[1], maxWidth: CHEST_SIZE },
  tapHint: { ...text('caption', { weight: '700' }), color: colors.chrome.text, textAlign: 'center' },
  journey: { gap: space[2] },
  progressText: { ...text('caption', { weight: '700', numeric: true }), color: colors.chrome.text },
  trail: { flexDirection: 'row', alignItems: 'center', paddingBottom: space[1] },
  connector: { flex: 1, height: space[1], backgroundColor: colors.chrome.counter },
  connectorDone: { backgroundColor: colors.course.face },
  milestone: { ...clayShadow(colors), minWidth: space[7], minHeight: space[7], borderRadius: radius.full, padding: space[1],
    alignItems: 'center', justifyContent: 'center' },
  number: { ...text('bodyStrong', { weight: '800', numeric: true }), color: colors.clay.sky.ink },
}) }))
