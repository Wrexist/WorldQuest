/**
 * The paywall.
 *
 * These assert the rules that are expensive to break: a child never sees a purchase, a
 * lesson is never gated, and the exit is always there. Those are App Review and FTC
 * exposure rather than preferences, so they are tested against the rendered tree rather
 * than trusted to review.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PaywallScreen } from './PaywallScreen.js'
import { SAMPLE_PLANS, yearlySavingPercent, type Plan } from './purchases.js'
import type { PaywallCountry } from './PaywallScreen.js'

/** Four real codes from the shipped pack, so the flag row resolves real artwork. */
const SAMPLE_COUNTRIES: readonly PaywallCountry[] = [
  { id: 'SE', name: 'Sweden', flagPath: 'flags/SE.png' },
  { id: 'NO', name: 'Norway', flagPath: 'flags/NO.png' },
  { id: 'DK', name: 'Denmark', flagPath: 'flags/DK.png' },
  { id: 'FI', name: 'Finland', flagPath: 'flags/FI.png' },
]

vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))

const paywall = (over: Partial<React.ComponentProps<typeof PaywallScreen>> = {}) => {
  const onPurchase = vi.fn(async () => ({ kind: 'purchased' as const }))
  const onRestore = vi.fn(async () => ({ kind: 'purchased' as const }))
  const onDismiss = vi.fn()
  const view = render(
    <PaywallScreen
      isChild={false}
      plans={SAMPLE_PLANS}
      countries={SAMPLE_COUNTRIES}
      onPurchase={onPurchase}
      onRestore={onRestore}
      onDismiss={onDismiss}
      source="onboarding"
      {...over}
    />,
  )
  return { ...view, onPurchase, onRestore, onDismiss }
}

/** Walks to the plans page, which is where the money is. */
const toPlans = () => {
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  }
}

describe('Paywall — the rules that cost money to break', () => {
  it('never shows a child a purchase', () => {
    // Apple requires commerce behind a parental gate for under-13s, and a ten-year-old
    // has no card anyway — a paywall aimed at them earns nothing and costs the listing.
    const { container } = paywall({ isChild: true })
    // "One quick step", not "Ask a grown-up". The gate stays — Apple requires it before a
    // purchase CTA aimed at a child, and rule 7 wants it too — but it now leads with what
    // the child already has rather than with what they must go and ask for.
    expect(screen.getByRole('heading').textContent).toBe('One quick step')
    expect(container.textContent).not.toMatch(/€|\$|month|year|trial/i)
    expect(screen.queryByTestId('paywall-buy')).toBeNull()
  })

  it('lets a child leave with nothing lost, and says so', () => {
    // The honest message and the required one are the same message here: every lesson
    // is free, so pressing this costs them nothing.
    const { onDismiss } = paywall({ isChild: true })
    fireEvent.click(screen.getByRole('button', { name: 'Back to learning' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('is dismissible on the very first frame, at full size', () => {
    // A paywall you cannot leave is a one-star review, and on a child-facing app it is
    // a review-team problem. No delayed close, no faint X.
    const { onDismiss } = paywall()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('promises that learning stays free, on every page that mentions money', () => {
    paywall()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText(/Every lesson stays free/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText(/Every lesson stays free/i)).toBeTruthy()
  })

  it('uses no urgency, scarcity or countdown', () => {
    // Banned by the Product Bible and a fast route to review attention on a children's
    // app. Asserted on the rendered copy rather than trusted to the writer.
    const { container } = paywall()
    toPlans()
    expect(container.textContent).not.toMatch(
      // Word boundaries, and they are load-bearing. Without them this fired on
      // "**Un**limited hearts" — a PERK, and one of the four now listed beside the price.
      // A guard that cannot tell "limited time" from "unlimited" fails on the screen
      // getting better, which is how a good check gets deleted.
      /\bhurry\b|\blimited\b|\bexpires\b|only \d+ (left|spots)|last chance|ends (soon|in)/i,
    )
  })
})

describe('Paywall — the offer', () => {
  it('speaks about what the user just did, not what they could buy', () => {
    paywall({ countries: SAMPLE_COUNTRIES.slice(0, 3) })
    expect(screen.getByRole('heading').textContent).toContain('3')
  })

  it('shows the flags of the countries they just placed, named for a reader', () => {
    // The most persuasive thing on the screen, and the only part of it that is a fact
    // rather than a claim. Labelled because the picture is the only thing naming the
    // country — a reader that skipped it would hear a headline followed by silence.
    const { container } = paywall()
    // `getAllBy`: react-native-web emits a labelled wrapper AND a hidden `<img alt>`
    // for the same flag, so a single-match query fails on its own correct output.
    for (const country of SAMPLE_COUNTRIES) {
      expect(screen.getAllByRole('img', { name: country.name }).length).toBeGreaterThan(0)
    }
    expect(container.querySelectorAll('img')).toHaveLength(SAMPLE_COUNTRIES.length)
  })

  it('never says "you just learned 0 countries"', () => {
    // Opened from Settings, or from a URL with a typo in it. With nothing to name,
    // page 1 has nothing to say, so the screen opens on the prices instead of on its
    // own worst sentence.
    const { container } = paywall({ countries: [], source: 'onboarding' })
    expect(container.textContent).not.toMatch(/0 countries/)
    expect(screen.getByTestId('paywall-buy')).toBeTruthy()
  })

  it('opens on the prices for someone who asked to see them', () => {
    // From Settings they have already decided to look. A three-page tour is friction,
    // and page 1 would greet them with a lesson they finished yesterday.
    paywall({ source: 'settings' })
    expect(screen.getByTestId('paywall-buy')).toBeTruthy()
    // And no progress dots, because there is no tour to be partway through.
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('pre-selects annual and keeps monthly selectable beside it', () => {
    // Anchoring, and the honest kind: both prices are real, both are pressable, and
    // the saving is arithmetic. Pre-SELECTED is fine; pre-CHARGED is a chargeback.
    paywall()
    toPlans()
    const [annual, monthly] = screen.getAllByRole('radio')
    expect(annual?.getAttribute('aria-checked')).toBe('true')
    expect(monthly?.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(monthly!)
    expect(screen.getAllByRole('radio')[1]?.getAttribute('aria-checked')).toBe('true')
  })

  it('states the trial terms in words, above the button, not behind a link', () => {
    paywall()
    toPlans()
    expect(screen.getByText(/Free for 7 days, then/i)).toBeTruthy()
    expect(screen.getByText(/Cancel any time/i)).toBeTruthy()
  })

  it('computes the saving from the real prices rather than a marketing number', () => {
    // €39/yr against €5.99/mo × 12 = €71.88 → 46%. If a regional price makes the
    // saving smaller, the badge must shrink with it.
    expect(yearlySavingPercent(SAMPLE_PLANS)).toBe(46)
    // Not comparable, or no saving — show nothing rather than something wrong.
    expect(yearlySavingPercent([])).toBeNull()
    const noSaving: readonly Plan[] = [
      { ...SAMPLE_PLANS[0]!, amountMicros: 99_000_000 },
      SAMPLE_PLANS[1]!,
    ]
    expect(yearlySavingPercent(noSaving)).toBeNull()
  })

  it('offers to buy rather than to try when the trial is spent', () => {
    // Re-offering a used trial is a promise the store refuses at the till.
    paywall({ plans: SAMPLE_PLANS.map((p) => ({ ...p, trialEligible: false })) })
    toPlans()
    expect(screen.getByRole('button', { name: 'Get Premium' })).toBeTruthy()
    expect(screen.queryByText(/Free for 7 days/i)).toBeNull()
  })
})

describe('Paywall — when it goes wrong', () => {
  it('does not grant anything itself — it closes and lets the server decide', async () => {
    // A client that granted its own Premium is a free subscription for anyone with a
    // proxy. The screen's only job on success is to get out of the way.
    const { onPurchase, onDismiss } = paywall()
    toPlans()
    fireEvent.click(screen.getByTestId('paywall-buy'))
    await waitFor(() => expect(onDismiss).toHaveBeenCalled())
    expect(onPurchase).toHaveBeenCalledWith('annual')
  })

  it('treats a cancel as a decision, not an error', async () => {
    const { onDismiss, container } = paywall({
      onPurchase: vi.fn(async () => ({ kind: 'cancelled' as const })),
    })
    toPlans()
    fireEvent.click(screen.getByTestId('paywall-buy'))
    await waitFor(() => expect(screen.getByTestId('paywall-buy')).toBeTruthy())
    expect(onDismiss).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/didn't go through/i)
  })

  it('says nothing was charged, which is the actual fear', async () => {
    paywall({ onPurchase: vi.fn(async () => ({ kind: 'failed' as const, reason: 'network' })) })
    toPlans()
    fireEvent.click(screen.getByTestId('paywall-buy'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/Nothing was charged/i)
  })

  it('offers restore, because both stores require it and phones get replaced', () => {
    const { onRestore } = paywall()
    toPlans()
    fireEvent.click(screen.getByRole('button', { name: 'Restore purchases' }))
    expect(onRestore).toHaveBeenCalledOnce()
  })

  it('survives a store that would not answer', () => {
    // `UNAVAILABLE.plans()` throws; the caller passes an empty list. The screen must
    // still render and still be escapable rather than trapping the user behind a
    // paywall with no prices on it.
    const { onDismiss } = paywall({ plans: [] })
    toPlans()
    expect(screen.queryByRole('radio')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

describe('Paywall — when there are no prices', () => {
  const plansPage = (over: Partial<React.ComponentProps<typeof PaywallScreen>>) => {
    const view = paywall({ plans: [], ...over })
    toPlans()
    return view
  }

  it('draws no purchase button at all, rather than a dead one', () => {
    // It used to render `GET PREMIUM` full-width in the disabled skin. At 768 that put a
    // dead primary action three hundred points BELOW the sentence explaining the store
    // could not be reached, while `TRY AGAIN` — the only control that can change
    // anything — was a small outline button up the page. The hierarchy said the opposite
    // of the truth.
    //
    // Same rule this codebase already applies to Profile's shop row and the streak
    // badge: absent hides the control rather than drawing a dead one.
    const { container } = plansPage({ plansFailed: true, onRetryPlans: () => {} })
    expect(screen.queryByTestId('paywall-buy')).toBeNull()
    // The two things that must survive: the way out, and the way to try again.
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(container.textContent).toMatch(/try again/i)
  })

  it('says it is asking, rather than showing an empty page', () => {
    const { container } = plansPage({ plansLoading: true })
    expect(container.textContent).toMatch(/Checking prices with the store/i)
  })

  it('treats being offline as a fact, not a failure', () => {
    // Being on a train is not an error and must not read like one. No alert role, no
    // retry button — there is nothing to retry until the connection comes back.
    const { container } = plansPage({ isOffline: true, plansFailed: true })
    expect(container.textContent).toMatch(/need a connection/i)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('says nothing was charged when the store could not be reached', () => {
    // The second sentence matters more than the first: the immediate fear is being
    // charged for nothing.
    plansPage({ plansFailed: true })
    expect(screen.getByRole('alert').textContent).toMatch(/Nothing was charged/i)
  })

  it('lets the user try the store again', () => {
    const onRetryPlans = vi.fn()
    plansPage({ plansFailed: true, onRetryPlans })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetryPlans).toHaveBeenCalledOnce()
  })

  it('owns up when the store answers with nothing to sell', () => {
    // A configuration problem on our side, never the user's — said without alarming
    // anyone, because every lesson is free regardless.
    const { container } = plansPage({})
    expect(container.textContent).toMatch(/nothing to buy here yet/i)
    expect(container.textContent).toMatch(/free in the meantime/i)
  })

  it('is still escapable with no prices on it, in every one of those states', () => {
    for (const state of [
      { plansLoading: true },
      { plansFailed: true },
      { isOffline: true },
      {},
    ]) {
      const { onDismiss, unmount } = plansPage(state)
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
      expect(onDismiss).toHaveBeenCalledOnce()
      unmount()
    }
  })
})

describe('Paywall — never promises what the till will refuse', () => {
  it('drops the trial headline when the trial is spent', () => {
    paywall({ plans: SAMPLE_PLANS.map((p) => ({ ...p, trialEligible: false })), source: 'settings' })
    expect(screen.getByRole('heading').textContent).not.toMatch(/free for a week/i)
    expect(screen.getByRole('button', { name: 'Get Premium' })).toBeTruthy()
  })

  it('drops it when there are no prices at all', () => {
    // The store-unreachable path, which is what a real device shows today. A headline
    // offering a free week above a button that cannot charge anything is the kind of
    // small lie that costs a refund and a review.
    paywall({ plans: [], plansFailed: true, source: 'settings' })
    expect(screen.getByRole('heading').textContent).not.toMatch(/free for a week/i)
  })
})
