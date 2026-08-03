import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsScreen, type PremiumStatus } from './SettingsScreen.js'
import { DEFAULTS } from './usePreferences.js'

const renderSettings = (overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) => {
  const onChange = vi.fn()
  const result = render(
    <SettingsScreen version="1.2.3" preferences={DEFAULTS} onChange={onChange} {...overrides} />,
  )
  return { ...result, onChange }
}

describe('Settings', () => {
  it('renders every section', () => {
    renderSettings()
    for (const heading of ['Learning', 'Sound & feel', 'Language', 'Privacy & data', 'About']) {
      expect(screen.getByText(heading)).toBeTruthy()
    }
  })

  it('announces each toggle as one element with its state', () => {
    // A settings list sees more screen-reader use than any other screen. A reader
    // that has to sweep a label, then a paragraph, then an unlabelled control is a
    // toggle nobody flips.
    renderSettings()
    // Haptics, not sound: haptics default ON and sound defaults OFF, so this is the
    // one that proves a switch renders its state rather than a constant.
    const haptics = screen.getByRole('switch', { name: 'Vibration' })
    expect(haptics.getAttribute('aria-checked')).toBe('true')
  })

  it('actually toggles when the announced element is activated', () => {
    // The bug this exists for: the element that announced itself as a switch was a
    // plain View and did nothing, while the real control next to it had no name.
    // Every existing test read `aria-checked` and none ever activated one, so a
    // toggle that could be heard and not used passed the whole suite.
    //
    // On native it was worse — `accessible` collapses children there, so the working
    // control was hidden outright and settings were unusable with VoiceOver.
    const { onChange } = renderSettings()
    fireEvent.click(screen.getByRole('switch', { name: 'Vibration' }))
    expect(onChange).toHaveBeenCalledWith('haptics', false)
  })

  it('exposes exactly one switch per setting, not two', () => {
    // react-native-web honours neither `accessibilityElementsHidden` (iOS) nor
    // `importantForAccessibility` (Android), so the inner control stayed in the tree
    // as a second, unlabelled switch on every row. `aria-hidden` is the one that
    // crosses over.
    renderSettings()
    const switches = screen.getAllByRole('switch')
    for (const node of switches) {
      expect(node.getAttribute('aria-label'), 'a switch with no name').toBeTruthy()
    }
  })

  it('starts with sound OFF, because nobody has been asked yet', () => {
    // design-system.md §9. A game that starts making noise on a bus, in a classroom,
    // or next to a sleeping baby has made an enemy in its first ten seconds. This
    // default read `true` for as long as there was no sound to play, and would have
    // been wrong the moment there was.
    renderSettings()
    expect(screen.getByRole('switch', { name: 'Sound effects' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('reflects a changed preference rather than its own state', () => {
    renderSettings({ preferences: { ...DEFAULTS, sound: true } })
    expect(screen.getByRole('switch', { name: 'Sound effects' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('offers the daily goal as visible radios, not a hidden picker', () => {
    // Three options behind a sheet costs a tap and hides that a choice exists.
    renderSettings()
    const selected = screen.getByRole('radio', { name: '10 minutes a day' })
    expect(selected.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: '5 minutes a day' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '20 minutes a day' })).toBeTruthy()
  })

  it('changes the language and reports the new value', () => {
    const { onChange } = renderSettings()
    fireEvent.click(screen.getByRole('radio', { name: 'Svenska' }))
    expect(onChange).toHaveBeenCalledWith('language', 'sv')
  })

  it('writes language names in their own language', () => {
    // "Swedish" is no help to someone who has accidentally set the app to a language
    // they cannot read. "Svenska" is.
    renderSettings()
    expect(screen.getByRole('radio', { name: 'Svenska' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Swedish' })).toBeNull()
  })

  it('shows the build version rather than a placeholder', () => {
    renderSettings()
    expect(screen.getByText('1.2.3')).toBeTruthy()
  })

  it('renders a row with no destination as text, not as a dead button', () => {
    // A button role promises an action. Promising one that does not exist is worse
    // than showing plain text.
    renderSettings({ onOpenPrivacyPolicy: undefined })
    expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull()
    expect(screen.getByText('Privacy policy')).toBeTruthy()
  })

  it('makes a row a button once it has somewhere to go', () => {
    const onOpenPrivacyPolicy = vi.fn()
    renderSettings({ onOpenPrivacyPolicy })
    fireEvent.click(screen.getByRole('button', { name: 'Privacy policy' }))
    expect(onOpenPrivacyPolicy).toHaveBeenCalledOnce()
  })

  it('has no export or delete button while there is no account to act on', () => {
    // Both are GDPR obligations that arrive with accounts. A button that cannot work
    // is worse than an explanation of why it is not there yet.
    renderSettings()
    // Assert on CONTROLS, not on text. The explanatory copy legitimately contains
    // the word "exporting", so matching text made this pass for the wrong reason.
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.getByText(/learning without an account/i)).toBeTruthy()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = renderSettings()
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})

describe('Settings — work waiting to sync', () => {
  const withSync = (parked: number, onRetry = vi.fn()) => {
    render(
      <SettingsScreen
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={{ parked, onRetry }}
      />,
    )
    return onRetry
  }

  it('says nothing at all when nothing is waiting', () => {
    // A permanent "0 items waiting" row is anxiety with no cause.
    const { container } = render(
      <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} sync={{ parked: 0, onRetry: vi.fn() }} />,
    )
    expect(container.textContent).not.toMatch(/waiting to sync/i)
  })

  it('names what is waiting, and says it is safe', () => {
    withSync(2)
    expect(screen.getByText(/2 lessons haven't reached the server yet/i)).toBeTruthy()
    expect(screen.getByText(/Nothing is lost/i)).toBeTruthy()
  })

  it('handles the singular without reading like a template', () => {
    withSync(1)
    expect(screen.getByText(/1 lesson hasn't reached the server yet/i)).toBeTruthy()
  })

  it('never says sync failed', () => {
    // The work IS safe — it just has not arrived. A child reading "failed" hears
    // "your lessons are gone".
    const { container } = render(
      <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} sync={{ parked: 3, onRetry: vi.fn() }} />,
    )
    expect(container.textContent).not.toMatch(/failed|error|couldn'?t sync|problem/i)
  })

  it('offers a way to try again', () => {
    const onRetry = withSync(2)
    fireEvent.click(screen.getByText('Try sending again'))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

/**
 * The subscription section.
 *
 * Three of these are money rather than polish: a paused subscriber must be offered a
 * fix rather than a paywall, cancelling must not be buried, and a child must not be
 * shown commerce at all. The first loses a subscriber who wanted to stay, the second
 * is the oldest dark pattern in subscriptions, and the third is an App Review problem.
 */
const PREMIUM: PremiumStatus = {
  isPremium: false,
  isTrialing: false,
  trialDaysLeft: null,
  needsBillingFix: false,
  isPaused: false,
  isEnding: false,
  onFixBilling: vi.fn(),
  onSeePlans: vi.fn(),
  onRestore: vi.fn(),
}

const withPremium = (over: Partial<PremiumStatus> = {}) => {
  const premium = { ...PREMIUM, ...over, onFixBilling: vi.fn(), onSeePlans: vi.fn(), onRestore: vi.fn() }
  const view = render(
    <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} premium={premium} />,
  )
  return { ...view, premium }
}

describe('Settings — the subscription', () => {
  it('shows nothing at all when there is no premium to manage', () => {
    // The child-account path. Absent, not disabled: a disabled row is still a
    // purchasing opportunity in the listing sense, and it also tells a ten-year-old
    // they are missing something.
    const { container } = renderSettings()
    expect(container.textContent).not.toMatch(/premium|restore purchases|subscription/i)
  })

  it('offers a fix, not a paywall, when the card was declined', () => {
    // A paused subscriber wanted to stay. Showing them the sales pitch instead of the
    // repair is how a bank's fraud heuristic turns into a cancelled subscription.
    const { premium } = withPremium({ needsBillingFix: true, isPaused: true })
    expect(screen.getByText(/Your payment didn't go through/i)).toBeTruthy()
    expect(screen.queryByText('See Premium')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Update payment' }))
    expect(premium.onFixBilling).toHaveBeenCalledOnce()
  })

  it('promises the learning is safe BEFORE it asks for a card', () => {
    // The fear is losing the streak, not the cosmetics. Reversing these two sentences
    // is the difference between a fix and a panic.
    const { container } = withPremium({ needsBillingFix: true, isPaused: true })
    const body = container.textContent ?? ''
    expect(body.indexOf('safe')).toBeGreaterThan(-1)
    expect(body.indexOf('safe')).toBeLessThan(body.indexOf('Update payment'))
  })

  it('puts a declined card above everything else in Settings', () => {
    // It is a problem the user needs to fix. An upsell is not, and sits at the bottom.
    const { container } = withPremium({ needsBillingFix: true })
    const body = container.textContent ?? ''
    expect(body.indexOf('Premium')).toBeLessThan(body.indexOf('Learning'))
  })

  it('keeps an upsell below the settings people actually came for', () => {
    const { container } = withPremium()
    const body = container.textContent ?? ''
    expect(body.indexOf('See Premium')).toBeGreaterThan(body.indexOf('Sound & feel'))
  })

  it('says when a trial charges, unprompted', () => {
    // Apple sends its own reminder; ours arrives first and is friendlier. It is the
    // cheapest chargeback reduction available.
    withPremium({ isPremium: true, isTrialing: true, trialDaysLeft: 3 })
    expect(screen.getByText(/3 days left of your free trial/i)).toBeTruthy()
  })

  it('handles the last day without reading like a template', () => {
    withPremium({ isPremium: true, isTrialing: true, trialDaysLeft: 0 })
    expect(screen.getByText(/free trial ends today/i)).toBeTruthy()
  })

  it('does not bury cancelling', () => {
    // Neither store lets an app cancel in-app, so the honest thing is one clearly
    // named row that opens the place where it lives.
    const { premium } = withPremium({ isPremium: true })
    fireEvent.click(screen.getByRole('button', { name: 'Manage subscription' }))
    expect(premium.onFixBilling).toHaveBeenCalledOnce()
  })

  it('states the facts to a leaver and makes them no offer', () => {
    // Reactivation after somebody has actually gone is 5%. Nagging inside the only
    // window with real odds spends it on nothing.
    const { container } = withPremium({ isPremium: true, isEnding: true })
    expect(screen.getByText(/runs until the end of the period/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(/are you sure|don'?t lose|discount|% off|last chance/i)
  })

  it('offers restore to everyone, because phones get replaced', () => {
    const { premium } = withPremium()
    fireEvent.click(screen.getByRole('button', { name: 'Restore purchases' }))
    expect(premium.onRestore).toHaveBeenCalledOnce()
  })

  it('opens the paywall only when the user asks for it', () => {
    const { premium } = withPremium()
    expect(premium.onSeePlans).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'See Premium' }))
    expect(premium.onSeePlans).toHaveBeenCalledOnce()
  })

  it('never uses urgency or shame anywhere in the section', () => {
    for (const state of [
      { isPremium: false },
      { isPremium: true },
      { isPremium: true, isEnding: true },
      { needsBillingFix: true, isPaused: true },
      { isPremium: true, isTrialing: true, trialDaysLeft: 1 },
    ]) {
      const { container, unmount } = withPremium(state)
      expect(container.textContent).not.toMatch(
        /hurry|expires soon|only \d+ (left|spots)|last chance|you'?ll lose|don'?t miss/i,
      )
      unmount()
    }
  })
})
