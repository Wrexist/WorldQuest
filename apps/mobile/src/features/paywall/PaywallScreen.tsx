/**
 * The paywall — three pages, shown once, immediately after the taster lesson.
 *
 * ## Where it sits, and why there
 *
 * Two benchmarks appear to disagree about paywall placement:
 *
 * - Hard paywalls convert installs to paid **5× better** than freemium (10.7 % vs 2.1 %).
 * - Paywalls after a measurable value moment get **2.1× the trial starts** of an
 *   immediate hard gate (65 % vs 31 %).
 *
 * They only disagree for products whose value moment is far from the front door. Ours
 * is three minutes in: the taster lesson is real, scored, and ends on a summary showing
 * the countries you just placed. Asking straight after it is *both* "at the start" and
 * "after the value" — so we take the 5× and the 2.1× at once.
 *
 * Three pages rather than one, because multi-page onboarding paywalls convert
 * **12.41 % vs 9.07 %** — a 37 % gap for the cost of two more `View`s.
 *
 * ## What it may not do
 *
 * - **Never shown to a child account.** Under-13 gets the parental gate instead. Apple
 *   requires commerce to sit behind one; more to the point, a ten-year-old has no card,
 *   so a paywall aimed at them earns nothing and costs the listing.
 * - **Never blocks a lesson.** Dismiss is on every page, visible, full-size, from the
 *   first frame. No delayed close button, no faint X. If this screen ever gates
 *   learning, the paywall has moved to the wrong place and takes the North Star with it.
 * - **No countdown, no scarcity, no "3 spots left".** Banned by the Product Bible, and
 *   a fast route to review attention on a child-facing app.
 *
 * Spec: docs/systems/monetization.md
 */

import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, Card, colors, radius, space, text } from '@worldquest/design'
import { Flag } from '../../components/Flag.js'
import { useT } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { yearlySavingPercent, type Plan, type PurchaseResult } from './purchases.js'
import { Icon } from '../../components/Icon.js'

/** One country the taster covered, resolved from the pack by the route. */
export type PaywallCountry = {
  readonly id: string
  /** A name from the content pack, never a translated string. */
  readonly name: string
  /** `assets.flag.path`, or undefined where we ship no artwork. */
  readonly flagPath: string | undefined
}

export type PaywallScreenProps = {
  /**
   * Under-13, from the age gate. Swaps the whole screen for the parental gate —
   * checked here rather than at the call site so a new entry point cannot forget it.
   */
  readonly isChild: boolean
  /** Priced by the store for this user. Empty means the store had nothing to sell. */
  readonly plans: readonly Plan[]
  /** The store has been asked for prices and has not answered yet. */
  readonly plansLoading?: boolean
  /**
   * The store could not be reached at all. Separate from an empty list because the
   * user can do something about this one, and nothing about the other.
   */
  readonly plansFailed?: boolean
  /**
   * No connection. Prices come from the store, so there is nothing to show and
   * nothing to retry until this changes — said plainly rather than as a failure,
   * because being on a train is not an error.
   */
  readonly isOffline?: boolean
  readonly onRetryPlans?: (() => void) | undefined
  /**
   * Whether OUR record says this user still has a trial to spend.
   *
   * For the impression event only, and it exists because that event fires on mount —
   * before the store has answered, so `plan.trialEligible` is not knowable yet. Without
   * it the funnel cannot tell a trial offer from a straight purchase offer, and those
   * two convert nothing like each other.
   *
   * The store is the authority at the till. If the two disagree, the prices page shows
   * the store's answer and this was only ever a label on a chart.
   */
  readonly trialOnRecord?: boolean
  /**
   * The countries the taster lesson just covered. Page 1 is about them, by name and
   * by flag — the count is `countries.length` rather than a second prop that could
   * disagree with the row it sits above.
   */
  readonly countries: readonly PaywallCountry[]
  readonly onPurchase: (planId: Plan['id']) => Promise<PurchaseResult>
  readonly onRestore: () => Promise<PurchaseResult>
  readonly onDismiss: () => void
  /** Where the paywall was opened from. Analytics only — never changes what is shown. */
  readonly source: 'onboarding' | 'hearts' | 'settings' | 'stats'
}

type Page = 0 | 1 | 2
const PAGES: readonly Page[] = [0, 1, 2]

/** Same as the lesson summary's, so the two screens read as one moment. */
const FLAG_WIDTH = 56

const PERKS = [
  'paywall:perk.hearts',
  'paywall:perk.offline',
  'paywall:perk.stats',
  'paywall:perk.cosmetics',
] as const

export function PaywallScreen({
  isChild,
  plans,
  plansLoading = false,
  plansFailed = false,
  isOffline = false,
  onRetryPlans,
  trialOnRecord = false,
  countries,
  onPurchase,
  onRestore,
  onDismiss,
  source,
}: PaywallScreenProps) {
  const t = useT()
  /**
   * The three-page tour is for the one moment it was written for: straight off the
   * taster lesson, where page 1 can say what the user just did and show the flags.
   *
   * Everywhere else it is skipped, and the screen opens on the prices. Two reasons,
   * and both are the same reason:
   *
   * - From Settings they tapped "See Premium". They have decided to look. Page 1 would
   *   greet them with "You just learned 4 countries" about a lesson they did
   *   yesterday, which reads as an app that is not paying attention.
   * - With no countries to name, page 1 has nothing to say and its headline degrades
   *   to "You just learned 0 countries" — the worst sentence on the screen.
   */
  const tour = source === 'onboarding' && countries.length > 0
  const [page, setPage] = useState<Page>(tour ? 0 : 2)
  const [selected, setSelected] = useState<Plan['id']>('annual')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Fired for the child branch too, as `blocked` — otherwise the funnel silently
    // under-counts and the parental gate looks like it converts at zero.
    track('paywall_shown', {
      source,
      variant: isChild
        ? 'parental_gate'
        : trialOnRecord
          ? '3page_trial'
          : '3page_purchase',
    })
  }, [source, isChild, trialOnRecord])

  if (isChild) return <ParentalGate onContinue={onDismiss} />

  const annual = plans.find((p) => p.id === 'annual')
  const monthly = plans.find((p) => p.id === 'monthly')
  const chosen = plans.find((p) => p.id === selected)
  const saving = yearlySavingPercent(plans)
  const trial = chosen?.trialEligible === true

  const buy = async (): Promise<void> => {
    if (chosen === undefined || busy) return
    setBusy(true)
    setFailed(false)
    track('plan_selected', { plan: chosen.id, with_trial: trial })
    const result = await onPurchase(chosen.id)
    setBusy(false)
    if (result.kind === 'purchased' || result.kind === 'already-owned') {
      // NOT granted here. The server validates the receipt and writes the entitlement;
      // this only closes the screen. A client that granted its own Premium would be a
      // free subscription for anyone with a proxy.
      onDismiss()
      return
    }
    // A cancel is a decision, not a fault — no error, no nagging, no second attempt.
    if (result.kind === 'cancelled') return
    track('purchase_failed', { reason: result.reason })
    setFailed(true)
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {page === 0 && (
          <>
            <Text style={styles.title} role="heading" aria-level={1}>
              {t('paywall:title.value', { count: countries.length })}
            </Text>
            <Text style={styles.paragraph}>{t('paywall:body.value')}</Text>
            {countries.length > 0 && (
              // The most persuasive thing on this screen, and it is not a claim: these
              // are the flags of the countries the user placed thirty seconds ago. The
              // page was two lines of text in a void before, which is a lot of empty
              // room to spend on the one moment they are most convinced.
              <View style={styles.flags}>
                {countries.map((country) => (
                  <Flag
                    key={country.id}
                    path={country.flagPath}
                    width={FLAG_WIDTH}
                    // Labelled, not decorative: here the picture is the only thing
                    // naming the country, and a reader that skipped it would hear a
                    // headline followed by silence.
                    label={country.name}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {page === 1 && (
          <>
            <Text style={styles.title} role="heading" aria-level={1}>
              {t('paywall:title.more')}
            </Text>
            <View style={styles.perks}>
              {PERKS.map((key) => (
                <View key={key} style={styles.perk}>
                  {/* Decorative — the row already reads as its own text, and a
                      reader saying "check mark" four times is noise. */}
                  <Icon name="check" size={20} color={colors.status.progress} />
                  <Text style={styles.perkLabel}>{t(key)}</Text>
                </View>
              ))}
            </View>
            {/* The most important line on the screen, and it appears on both pages that
                mention money. Premium sells depth, never access. */}
            <Text style={styles.free}>{t('paywall:body.free')}</Text>
          </>
        )}

        {page === 2 && (
          <>
            {/* Leads with the trial only when there is one. With the trial spent — or
                with no prices at all — "Try it free for a week" is a promise sitting
                above a button that says "Get Premium", which is the kind of small lie
                that costs a refund and a review. */}
            <Text style={styles.title} role="heading" aria-level={1}>
              {trial ? t('paywall:title.plans') : t('paywall:title.buy')}
            </Text>

            {/* The four ways page 3 can have no prices on it, each said differently.
                Collapsing them into one "something went wrong" would tell a user on a
                train to retry forever, and tell a user with a real failure nothing. */}
            {plans.length === 0 && (
              <Text style={styles.terms} role={plansFailed && !isOffline ? 'alert' : undefined}>
                {isOffline
                  ? t('paywall:plans.offline')
                  : plansLoading
                    ? t('paywall:plans.loading')
                    : plansFailed
                      ? t('paywall:plans.failed')
                      : t('paywall:plans.none')}
              </Text>
            )}
            {plans.length === 0 && plansFailed && !isOffline && onRetryPlans !== undefined && (
              /* A real control, not a text link. When the store is unreachable this is
                 the ONLY thing on the page that can change the outcome — every other
                 control is disabled for want of a price — and it was rendering as
                 secondary-coloured body text with no ring and no depth. The target was
                 already 44pt; what was missing was any sign it could be pressed.

                 `tertiary`, so it reads as pressable without competing with the primary
                 purchase button sitting disabled below it. */
              <Button
                label={t('common:retry')}
                onPress={onRetryPlans}
                variant="tertiary"
                size="sm"
                fullWidth={false}
                style={styles.retry}
              />
            )}

            {annual !== undefined && (
              <PlanCard
                label={t('paywall:plan.annual')}
                perMonth={t('paywall:plan.perMonth', { price: annual.pricePerMonth })}
                total={t('paywall:plan.billedYearly', { price: annual.price })}
                badge={saving === null ? undefined : t('paywall:plan.save', { percent: saving })}
                selected={selected === 'annual'}
                onSelect={() => setSelected('annual')}
              />
            )}
            {monthly !== undefined && (
              <PlanCard
                label={t('paywall:plan.monthly')}
                perMonth={t('paywall:plan.perMonth', { price: monthly.pricePerMonth })}
                selected={selected === 'monthly'}
                onSelect={() => setSelected('monthly')}
              />
            )}

            {/* Terms above the button, in words, not behind a link. Both stores require
                the price and the renewal to be legible before the tap; so does anyone
                who does not want a refund request. */}
            {trial && chosen !== undefined && (
              <Text style={styles.terms}>
                {t('paywall:terms.trial', { price: chosen.price })}
              </Text>
            )}
            <Text style={styles.free}>{t('paywall:body.free')}</Text>
            {failed && (
              <Text style={styles.error} role="alert">
                {t('paywall:error.failed')}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {/* Only while there is a tour to be partway through. Three dots above a screen
            you entered on the last one is a progress bar that lies. */}
        {tour && (
          <View style={styles.dots} aria-hidden>
            {PAGES.map((p) => (
              <View key={p} style={[styles.dot, p === page && styles.dotOn]} />
            ))}
          </View>
        )}

        {page < 2 ? (
          <Button
            label={t('common:continue')}
            onPress={() => setPage((page + 1) as Page)}
            fullWidth
            size="lg"
          />
        ) : (
          <Button
            label={trial ? t('paywall:cta.trial') : t('paywall:cta.buy')}
            onPress={() => void buy()}
            disabled={chosen === undefined}
            loading={busy}
            fullWidth
            size="lg"
            testID="paywall-buy"
          />
        )}

        {/* Full size, always visible, from the first frame. A paywall you cannot leave
            is a one-star review, and on a child-facing app it is a review-team problem. */}
        <Pressable onPress={onDismiss} hitSlop={space[2]} style={styles.dismiss} role="button">
          <Text style={styles.dismissLabel}>{t('paywall:dismiss')}</Text>
        </Pressable>

        {page === 2 && (
          <Pressable
            onPress={() => void onRestore()}
            hitSlop={space[2]}
            style={styles.dismiss}
            role="button"
          >
            <Text style={styles.restore}>{t('paywall:restore')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

/**
 * What an under-13 account sees instead.
 *
 * Addressed TO THE CHILD, in their words, explaining rather than refusing — and it
 * never implies they are missing out on something. The point is that they lose nothing
 * by pressing the button: every lesson is free, so the honest message and the required
 * one are the same message.
 */
function ParentalGate({ onContinue }: { onContinue: () => void }) {
  const t = useT()

  return (
    <View style={[styles.screen, styles.centred]}>
      <Text style={styles.title} role="heading" aria-level={1}>
        {t('paywall:adult.title')}
      </Text>
      <Text style={styles.paragraph}>{t('paywall:adult.body')}</Text>
      <Button label={t('paywall:adult.continue')} onPress={onContinue} fullWidth size="lg" />
    </View>
  )
}

function PlanCard({
  label,
  perMonth,
  total,
  badge,
  selected,
  onSelect,
}: {
  label: string
  perMonth: string
  total?: string | undefined
  badge?: string | undefined
  selected: boolean
  onSelect: () => void
}) {
  return (
    <Card
      level={selected ? 2 : 1}
      onPress={onSelect}
      // `radio`, and `aria-checked` rather than `accessibilityState` — react-native-web
      // drops the latter, so a reader would announce no selection at all.
      role="radio"
      aria-checked={selected}
      accessibilityLabel={`${label}. ${perMonth}${total === undefined ? '' : `. ${total}`}`}
      style={[styles.plan, selected && styles.planOn]}
    >
      <View style={styles.planTop}>
        <Text style={styles.planLabel} aria-hidden>
          {label}
        </Text>
        {badge !== undefined && (
          <Text style={styles.badge} aria-hidden>
            {badge}
          </Text>
        )}
      </View>
      <Text style={styles.planPrice} aria-hidden>
        {perMonth}
      </Text>
      {total !== undefined && (
        <Text style={styles.planTotal} aria-hidden>
          {total}
        </Text>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas, padding: space[4], gap: space[4] },
  centred: { alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 1, justifyContent: 'center', gap: space[4] },

  title: { ...text('h1'), color: colors.text.primary, textAlign: 'center' },
  // A real text token, not the ScrollView's layout style. This paragraph spent one
  // build rendering as near-black on navy because `styles.body` was applied to both —
  // invisible, and invisible to `pnpm design:contrast`, which checks token PAIRS and
  // cannot see a colour that was never set. The screenshot caught it; nothing else did.
  paragraph: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  flags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    justifyContent: 'center',
  },
  perks: { gap: space[3], alignSelf: 'stretch' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  tick: { ...text('h3'), color: colors.status.progress },
  perkLabel: { ...text('bodyStrong'), color: colors.text.primary },
  free: { ...text('bodyStrong'), color: colors.status.progress, textAlign: 'center' },
  terms: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
  error: { ...text('caption'), color: colors.text.primary, textAlign: 'center' },

  plan: { alignSelf: 'stretch', gap: space[1] },
  planOn: { borderColor: colors.action.primary },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planLabel: { ...text('bodyStrong'), color: colors.text.primary },
  badge: { ...text('caption'), color: colors.status.progress },
  planPrice: { ...text('h2', { numeric: true }), color: colors.text.primary },
  planTotal: { ...text('caption'), color: colors.text.secondary },

  footer: { gap: space[3] },
  dots: { flexDirection: 'row', gap: space[2], justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.bg.surfaceRaised },
  dotOn: { backgroundColor: colors.action.primary },
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  retry: { alignSelf: 'center', marginTop: space[2] },
  dismissLabel: { ...text('bodyStrong'), color: colors.text.secondary },
  restore: { ...text('caption'), color: colors.text.secondary },
})
