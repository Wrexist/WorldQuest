/**
 * Home — the daily entry point, and the app's default route.
 *
 * Routes stay thin: fetch, compose, delegate. All of Home's layout lives in
 * `features/home/HomeScreen`, which is what the screenshot tooling renders and what
 * component tests mount. This file connects it to navigation and to data.
 */

import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { HomeScreen, type HomeProgress } from '../../src/features/home/HomeScreen.js'
import { useContent } from '../../src/lib/content.js'
import { useOnline } from '../../src/lib/connectivity.js'
import { useOptimisticProgress } from '../../src/features/home/useOptimisticProgress.js'
import { useDailyGoal } from '../../src/features/home/useDailyGoal.js'
import { useDailyQuest } from '../../src/features/quests/useDailyQuest.js'
import { questFocus, questStanding } from '@worldquest/engines'
import { focusToParams } from '../../src/features/lesson/focusParams.js'
import { equippedTitleKey, levelProgress, worldProgress } from '@worldquest/engines'
import { CATALOGUE } from '../../src/features/shop/catalogue.js'
import { useShop } from '../../src/features/shop/useShop.js'
import { useDayCountdown } from '../../src/features/quests/useDayCountdown.js'
import { useQuestCover } from '../../src/features/quests/ceremony.js'
import { useT, type TranslationKey } from '../../src/lib/i18n.js'
import { useReminderAsk } from '../../src/features/home/useReminderAsk.js'
import { useLeague } from '../../src/features/league/useLeague.js'
import { useLeagueEnabled } from '../../src/features/league/flag.js'

/**
 * Zeroed rather than invented. A first launch shows the real empty state — and a
 * failed fetch shows it too, rather than numbers that would be a lie.
 */
const COLD_START: HomeProgress = {
  xpTotal: 0,
  coins: 0,
  streak: 0,
}

export default function HomeRoute() {
  const router = useRouter()
  const t = useT()
  const { shown, status, refreshFailed } = useOptimisticProgress()
  const online = useOnline()
  const shop = useShop()

  // The SAME call Explore makes, rather than a second count assembled here. Two
  // places counting the same thing agree until one of them changes — and these two
  // already disagreed: Home carried a hardcoded `factsTotal: 10` beside a comment
  // saying "the packs are five countries deep today". They are 65 countries and 259
  // facts, and nothing rendered the number, so nobody saw it was wrong.
  const { index, memory } = useContent()
  const world = useMemo(
    () => (index === null ? undefined : worldProgress(index.index, memory, Date.now())),
    [index, memory],
  )

  // The daily goal, finally connected to something. It was asked for in onboarding,
  // stored, shown in Settings, and read by nothing — `lessonsPerDay()` sat unused in
  // the engine, so choosing 5 minutes or 20 minutes changed precisely nothing.
  //
  // Behind a hook now rather than computed here, because the target has to HOLD for the
  // day: recomputed inline it moved every time the measured pace did, so finishing a
  // lesson could make the day's target bigger and the bar the user was filling longer.
  // See `useDailyGoal` for the whole story.
  /**
   * Today's quest — the card's subject, and the session it starts.
   *
   * `useDailyQuest()` has composed five tasks a day since the quest engine landed, and
   * every task carries the exact `factIds` it wants answered. Home started a GENERIC
   * lesson and the quest advanced only as a side effect, so a user watched a bar move for
   * reasons they could not see. `questFocus` turns the quest back into the lesson it
   * always described — see `docs/product/daily-quest-research.md`.
   */
  /**
   * The daily goal, reduced to one decision: offer another lesson after the quest, or not.
   *
   * It stopped driving the card when the quest replaced it — but a setting asked for in
   * onboarding, shown in Settings and read by NOTHING is the exact bug this app already
   * had once and documented at length. So it keeps the one job it can honestly still do:
   * somebody who asked for five minutes a day and finished the quest is done, and should
   * not be handed another button; somebody who asked for twenty wants it.
   */
  // Shared with the Quests tab, which counts down to the same midnight. The hook gives
  // hours and minutes; each screen writes its own whole sentence around them.
  const untilReset = useDayCountdown()

  /** The title being worn, for the middle fact chip. Resolved the way Profile does it. */
  const worn = equippedTitleKey(
    levelProgress(shown?.xpTotal ?? 0).titleKey,
    shop.equippedId,
    CATALOGUE,
    shop.owned,
  )

  const coverPage = useQuestCover()
  const goal = useDailyGoal()
  const { quest } = useDailyQuest()
  const standing = quest === null ? undefined : questStanding(quest)
  const focus = quest === null ? undefined : questFocus(quest)

  // `shown`, not the raw server row: it is the server's figures plus any lesson the
  // queue has not delivered yet. Before this, a lesson finished offline moved nothing on
  // this screen — the XP the summary card had just celebrated was invisible the second
  // the user tapped through to Home. See `useOptimisticProgress`.
  const progress: HomeProgress = shown
    ? {
        xpTotal: shown.xpTotal,
        // The prediction, not the spendable balance. Nothing on Home takes coins — the
        // Shop and the freeze button do, and both read `coins` — so this is a record,
        // and a record that ignored the lesson just finished disagreed with Profile,
        // which shows the same wallet one tab away.
        coins: shown.coinsIncludingPending,
        streak: shown.streak,
      }
    : COLD_START

  const reminderAsk = useReminderAsk()

  /**
   * The league chip, only when there is genuinely a standing to show.
   *
   * Four conditions, all ordinary and all indistinguishable from here: the flag is
   * closed, the user opted out, they are under 13, or the weekly placement has not run
   * for them. `useLeague` returns no rows for every one of them, and no rows means no
   * chip — rather than a chip explaining why there is no chip.
   */
  const leagueOn = useLeagueEnabled()
  const league = useLeague()
  const you = league.rows?.find((row) => row.isYou === true)
  const leagueChip =
    leagueOn && league.rows !== null && league.rank !== null && you !== undefined
      ? {
          tier: t(`league:tier.${league.rank.tier}` as 'league:tier.bronze'),
          position: you.position,
          total: league.rows.length,
          onPress: () => router.push('/league'),
        }
      : undefined

  return (
    <HomeScreen
      progress={progress}
      loading={status === 'loading'}
      // The radio first, and the failed refresh second. This read
      // `isStale || status === 'error'`, and `staleTime` is 60 seconds — so Home told
      // anyone who left the tab open for a minute that they were offline. Meanwhile a
      // user who actually WAS offline saw nothing until the cache aged out, and a
      // build with no backend configured could never show the banner at all, which is
      // why every screenshot ever taken of this screen looked fine.
      //
      // `useOnline` is the same source the Shop's "buying is paused" notice reads, so
      // two screens can no longer disagree about whether the device is connected.
      isOffline={!online || refreshFailed || status === 'error'}
      onOpenStreak={() => router.push('/streak')}
      // The quest's own facts, not a shuffle. `focus` is undefined once the quest is
      // finished, which is exactly when the button stops being primary and becomes
      // "practise anyway" — an ordinary lesson, correctly.
      // Through the quest's cover page rather than straight into the runner — but only
      // while the quest is unfinished, and only while the flag is on. Once the quest is
      // done the same button is "practise anyway", which is an ordinary lesson and has
      // no quest to introduce.
      //
      // Flagged because it puts one more tap between a user and the thing the product is
      // for, and the only honest way to learn whether that costs completions is a staged
      // rollout. Off is exactly the old path. See `features/quests/ceremony.ts`.
      onStartLesson={() => {
        if (coverPage && standing !== undefined && !standing.complete) {
          router.push('/quest')
          return
        }
        const query = focus === undefined ? '' : `?${focusToParams(focus, undefined)}`
        router.push(`/lesson${query}`)
      }}
      {...(standing !== undefined ? { quest: standing } : {})}
      offerMore={goal.done < goal.target}
      world={world}
      onOpenWorld={() => router.push('/explore')}
      resetsIn={t('home:quest.resets', untilReset)}
      titleKey={worn as TranslationKey}
      onOpenQuests={() => router.push('/quests')}
      // Twice in the lifetime of an install, after the third finished lesson, on the
      // screen a lesson ends on. `useReminderAsk` returns undefined the rest of the time
      // and the card is simply absent — see `notifications.md` §1.
      {...(reminderAsk !== undefined ? { reminderAsk } : {})}
      {...(leagueChip !== undefined ? { league: leagueChip } : {})}
      onOpenInbox={() => router.push('/quests')}
    />
  )
}
