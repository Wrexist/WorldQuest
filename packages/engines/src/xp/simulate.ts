/**
 * Economy simulation.
 *
 * Run before merging any change to balance.ts, and put the before/after in the PR.
 * Economy bugs are found by users, loudly, and cannot be walked back once people
 * have balances — so the numbers get simulated, not intuited.
 *
 * Run: pnpm engines:simulate
 */

import { seededRng } from '../shared/index.js'
import { BALANCE, levelForXp, xpForLevel } from './balance.js'

type Cohort = {
  name: string
  minutesPerDay: number
  accuracy: number
  /** Days per week they actually open the app. */
  activeDays: number
}

const COHORTS: Cohort[] = [
  { name: 'casual  (5 min)', minutesPerDay: 5, accuracy: 0.75, activeDays: 4 },
  { name: 'regular (10 min)', minutesPerDay: 10, accuracy: 0.85, activeDays: 6 },
  { name: 'heavy   (30 min)', minutesPerDay: 30, accuracy: 0.92, activeDays: 7 },
]

const DAYS = 90
const ITEM_MS = 8_000
/** Kept in step with the quest engine's five slots. */
const SLOTS_PER_QUEST = 5

const ITEMS_PER_LESSON = 15

/**
 * What a user actually buys over time: a cheap avatar item, then a theme, then a
 * map skin, then a pet. Flat pricing would understate real spending and hide a
 * hoarding problem instead of surfacing it.
 */
const PRICE_LADDER = [
  BALANCE.prices.avatarItem.min,
  BALANCE.prices.titleUnlock,
  BALANCE.prices.theme,
  BALANCE.prices.mapSkin,
  BALANCE.prices.pet.min,
  BALANCE.prices.avatarItem.max,
  BALANCE.prices.pet.max,
]

type Result = {
  cohort: string
  totalXp: number
  level: number
  coinsEarned: number
  coinsSpent: number
  firstCosmeticDay: number | null
  heartBlocks: number
  lessons: number
  softCapDays: number
}

function simulate(cohort: Cohort): Result {
  const rng = seededRng(20260731)
  let totalXp = 0
  let coins = 0
  let coinsEarned = 0
  let coinsSpent = 0
  let hearts: number = BALANCE.hearts.max
  let heartBlocks = 0
  let lessons = 0
  let softCapDays = 0
  let firstCosmeticDay: number | null = null
  const owned: string[] = []

  for (let day = 1; day <= DAYS; day++) {
    // Not every day is an active day.
    if (rng.next() > cohort.activeDays / 7) continue

    const lessonsToday = Math.max(
      1,
      Math.round((cohort.minutesPerDay * 60_000) / (ITEMS_PER_LESSON * ITEM_MS)),
    )
    let xpToday = 0

    for (let l = 0; l < lessonsToday; l++) {
      lessons++
      // Hearts are per-lesson: every lesson starts fresh.
      if (BALANCE.hearts.resetPerLesson) hearts = BALANCE.hearts.max
      let correct = 0
      let correctRun = 0

      for (let i = 0; i < ITEMS_PER_LESSON; i++) {
        // 60/30/10 selection means ~30 % of a lesson is new content, which never
        // costs a heart. See selection.ts.
        const isNewItem = rng.next() < 0.3

        if (rng.next() < cohort.accuracy) {
          correct++
          correctRun++
          xpToday += BALANCE.xp.correctAnswer
          coinsEarned += BALANCE.coins.correctAnswer
          // A run of correct answers earns a heart back, capped at max.
          if (correctRun % BALANCE.hearts.restoreEveryCorrectStreak === 0) {
            hearts = Math.min(BALANCE.hearts.max, hearts + 1)
          }
        } else {
          correctRun = 0
          if (!isNewItem || BALANCE.hearts.newItemsCostHearts) {
            hearts--
            if (hearts <= 0) {
              heartBlocks++
              break
            }
          }
        }
      }

      if (correct >= BALANCE.xp.minItemsForCompletionBonus) {
        xpToday += BALANCE.xp.lessonComplete
      }
      if (correct === ITEMS_PER_LESSON) {
        xpToday += BALANCE.xp.perfectLesson
        coinsEarned += BALANCE.coins.perfectLesson
      }
      if (l === 0) xpToday += BALANCE.xp.firstLessonOfDay
    }

    // Daily quest. Five slots pay per slot; the bonus pays once, on all five.
    //
    // Partial completion is modelled, not just the all-or-nothing case — most days a
    // user finishes three or four slots, and pretending otherwise understates the
    // quest's contribution by more than half.
    const slotsDone = rng.next() < 0.7 ? SLOTS_PER_QUEST : Math.floor(rng.next() * SLOTS_PER_QUEST)
    xpToday += slotsDone * BALANCE.xp.dailyQuestTask
    if (slotsDone === SLOTS_PER_QUEST) {
      xpToday += BALANCE.xp.dailyQuest
      coinsEarned += BALANCE.coins.dailyQuest
    }

    // Facts crossing into mastery — the one XP source volume cannot farm.
    xpToday += Math.round(lessonsToday * 0.8) * BALANCE.xp.factMastered

    // The soft cap: past it, XP earns at 25% and we say so plainly.
    if (xpToday > BALANCE.xp.dailySoftCap) {
      softCapDays++
      const over = xpToday - BALANCE.xp.dailySoftCap
      xpToday = BALANCE.xp.dailySoftCap + over * BALANCE.xp.softCapMultiplier
    }

    totalXp += xpToday
    coins = coinsEarned - coinsSpent

    // Spending ladder: an avatar item first, then progressively bigger sinks.
    // Modelling a flat price understates how much a committed user actually
    // spends, and would hide a hoarding problem rather than reveal one.
    const nextPrice = PRICE_LADDER[Math.min(owned.length, PRICE_LADDER.length - 1)]!
    if (coins >= nextPrice + 200) {
      coinsSpent += nextPrice
      owned.push(`item-${owned.length + 1}`)
      if (firstCosmeticDay === null) firstCosmeticDay = day
    }
  }

  return {
    cohort: cohort.name,
    totalXp: Math.round(totalXp),
    level: levelForXp(Math.round(totalXp)),
    coinsEarned,
    coinsSpent,
    firstCosmeticDay,
    heartBlocks,
    lessons,
    softCapDays,
  }
}

const results = COHORTS.map(simulate)

console.log(`Economy simulation — ${DAYS} days\n`)
console.log(
  '  cohort              level      XP    coins in   coins out   1st cosmetic   heart blocks',
)
console.log('  ' + '-'.repeat(88))
for (const r of results) {
  console.log(
    `  ${r.cohort.padEnd(18)} ${String(r.level).padStart(5)} ${String(r.totalXp).padStart(7)} ` +
      `${String(r.coinsEarned).padStart(11)} ${String(r.coinsSpent).padStart(11)} ` +
      `${(r.firstCosmeticDay ? `day ${r.firstCosmeticDay}` : 'never').padStart(14)} ` +
      `${String(r.heartBlocks).padStart(14)}`,
  )
}

console.log('\nHealth checks')
let failures = 0
const check = (label: string, pass: boolean, detail: string) => {
  if (!pass) failures++
  console.log(`  ${pass ? '✓' : '✗'} ${label.padEnd(46)} ${detail}`)
}

for (const r of results) {
  const ratio = r.coinsSpent / Math.max(1, r.coinsEarned)
  const blockRate = r.heartBlocks / Math.max(1, r.lessons)

  check(
    `${r.cohort} · coins spent vs earned`,
    ratio >= 0.5,
    `${(ratio * 100).toFixed(0)}% spent (a hoard means nothing is worth buying)`,
  )
  check(
    `${r.cohort} · heart block rate`,
    blockRate < 0.15,
    `${(blockRate * 100).toFixed(1)}% of lessons (limit 15%)`,
  )
  check(
    `${r.cohort} · first cosmetic within 2 weeks`,
    r.firstCosmeticDay !== null && r.firstCosmeticDay <= 14,
    r.firstCosmeticDay ? `day ${r.firstCosmeticDay}` : 'never — the shop is unreachable',
  )
}

// The level curve is the one number that shapes the whole long game.
const regular = results[1]!
check(
  'regular user is not past level 60 in 90 days',
  regular.level <= 60,
  `level ${regular.level} (a curve that tops out early leaves nothing to chase)`,
)
check(
  'regular user passes level 10 in 90 days',
  regular.level >= 10,
  `level ${regular.level} (too slow and the early game feels like work)`,
)
check(
  'soft cap is rare for a heavy user',
  results[2]!.softCapDays / DAYS < 0.35,
  `${results[2]!.softCapDays} of ${DAYS} days hit it`,
)

console.log(`\n  Level milestones: ${[10, 20, 38, 50, 100]
  .map((l) => `L${l}=${xpForLevel(l).toLocaleString()}`)
  .join('  ')}`)

if (failures > 0) {
  console.error(`\n✗ ${failures} health check(s) failed — do not merge this balance change`)
  process.exit(1)
}
console.log('\n✓ economy healthy')
