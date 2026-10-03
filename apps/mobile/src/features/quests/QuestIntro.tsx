import { createThemeStyles } from '@worldquest/design'
/**
 * The sheet that opens today's quest — mockup screen 3.
 *
 * ## Why a screen exists between the button and the lesson
 *
 * The quest card's button used to go straight into the runner, so the five tasks and
 * what finishing them pays were on a tab the user had not opened. The redesign puts a
 * beat in between: here is what today is, here is what it is worth, start when you are
 * ready. That beat is the whole reason a daily quest reads as an event rather than as a
 * lesson with a bar over it.
 *
 * It is deliberately NOT a second quest. Same `DailyQuest`, same five tasks, same facts —
 * this is a cover page for the thing the Quests tab lists in full.
 *
 * ## The rewards are read, never typed
 *
 * `BALANCE` is the single source of truth for every reward number in this product
 * (`docs/systems/xp-economy.md` §5), and a screen that advertises a figure the server
 * does not award is worse than one that advertises nothing. So the two chips read
 * `BALANCE.xp.dailyQuest` and `BALANCE.coins.dailyQuest` directly.
 *
 * The reference shows a third chip paying gems. Gems are purchase-only by design — §4 of
 * the same document, "Never buy hearts, XP, league position, or progression" — so a free
 * daily quiz that mints premium currency is a change to how this product makes money,
 * not a change to this screen. Two chips that are true beat three that are not.
 *
 * ## Five states
 *
 * Content, and one other: a quest that has not been composed yet. There is no loading
 * spinner because the quest is generated on the device from the content index, no error
 * because nothing is fetched, and no offline state because none of it needs a network —
 * which is the same argument `QuestScreen` records for the same reasons.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Card, radius, space, squircle, text } from '@worldquest/design'
import { BALANCE, questProgress, type DailyQuest } from '@worldquest/engines'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'
import { ExplorerChestStill } from '../../components/ExplorerChestArt.js'
import { Icon } from '../../components/Icon.js'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Stat } from '../../components/Stat.js'
import type { DayCountdown } from './useDayCountdown.js'

export type QuestIntroProps = {
  readonly quest: DailyQuest | null
  /** Starts the quest's own lesson. */
  readonly onStart: () => void
  readonly onClose?: (() => void) | undefined
  /** Hours and minutes until today's quest is replaced. See `useDayCountdown`. */
  readonly resetsIn?: DayCountdown | undefined
}

/**
 * The hero.
 *
 * Atlas and today's expedition chest. The chest stays closed while there are tasks
 * left: this is an invitation to explore, not a reward receipt or a claim action.
 */
const HERO = 168

export function QuestIntro({ quest, onStart, onClose, resetsIn }: QuestIntroProps) {
  const { colors, styles } = useThemeValues()
  const t = useT()
  const standing = quest === null ? null : questProgress(quest)

  return (
    <View style={styles.screen}>
      {/* The header only exists when there is a way out. Mounted by the screenshot
          renderer and the component tests without a router, this screen still has to
          draw — and a back chevron that goes nowhere is worse than none. */}
      {onClose !== undefined && <ScreenHeader title={t('quests:intro.title')} onBack={onClose} />}

      <ScrollView contentContainerStyle={styles.body}>
        <View pointerEvents="none" style={styles.hero}>
          <Art name="atlas/thinking" size={88} />
          <ExplorerChestStill size={HERO} opened={quest?.complete === true} />
        </View>

        <Text style={styles.title} role="heading">
          {t('quests:intro.headline', { count: standing?.total ?? 0 })}
        </Text>
        <Text style={styles.subtitle}>{t('quests:intro.body')}</Text>

        {/* What finishing it pays. Same two chips as the card on Home, same source. */}
        <View style={styles.rewards}>
          <Reward
            kind="xp"
            amount={BALANCE.xp.dailyQuest}
            label={t('home:quest.reward.xp', { amount: BALANCE.xp.dailyQuest })}
          />
          <Reward
            kind="coin"
            amount={BALANCE.coins.dailyQuest}
            label={t('home:quest.reward.coins', { amount: BALANCE.coins.dailyQuest })}
          />
        </View>

        {/* Progress, when there is some. Someone opening this at task three should see
            three, not a cover page pretending the day has not started. */}
        {standing !== null && standing.done > 0 && (
          <Text style={styles.progress}>
            {t('quests:progress', { done: standing.done, total: standing.total })}
          </Text>
        )}

        {resetsIn !== undefined && (
          <View style={styles.reset}>
            <Icon name="clock" size={14} color={colors.text.tertiary} />
            <Text style={styles.resetText}>{t('quests:resets', resetsIn)}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button
          label={standing !== null && standing.done > 0 ? t('common:continue') : t('quests:intro.start')}
          onPress={onStart}
          // A quest that has not been composed has no facts to play. Disabled rather than
          // hidden: a button that appears once the index finishes building is a button
          // nobody knew they were waiting for.
          disabled={quest === null}
        />
      </View>
    </View>
  )
}

/**
 * One reward, as a tile rather than a wallet chip.
 *
 * `Stat` is the pill that carries a BALANCE — what you have — and these are what you
 * would get, so they are a stacked tile instead. Using the pill for both would make an
 * offer look like a receipt.
 */
function Reward({
  kind,
  amount,
  label,
}: {
  readonly kind: 'xp' | 'coin'
  readonly amount: number
  readonly label: string
}) {
  const { styles } = useThemeValues()
  return (
    <Card level={2} style={styles.reward} accessibilityLabel={label}>
      {/* The card carries the name, so the pill inside it is silent — otherwise a
          reader hears "Earns 50 XP" and then "50 XP" about the same tile. */}
      <Stat kind={kind} value={`+${amount}`} accessibilityLabel="" />
    </Card>
  )
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], paddingHorizontal: space[5], paddingVertical: space[4] },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: space[2] },
  title: { ...text('h1'), color: colors.text.primary, textAlign: 'center', maxWidth: '100%' },
  subtitle: { ...text('body'), color: colors.text.secondary, textAlign: 'center', maxWidth: '100%' },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[3], marginTop: space[2], maxWidth: '100%' },
  reward: { alignItems: 'center', paddingVertical: space[3], paddingHorizontal: space[4], borderRadius: radius.lg, ...squircle },
  progress: { ...text('bodyStrong', { numeric: true }), color: colors.text.primary },
  reset: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], maxWidth: '100%' },
  resetText: { ...text('caption', { numeric: true }), color: colors.text.tertiary, flexShrink: 1 },
  actions: { padding: space[4], gap: space[2] },
})
  return { colors, styles }
})
