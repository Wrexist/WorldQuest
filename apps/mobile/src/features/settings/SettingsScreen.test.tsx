import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsScreen, type PremiumStatus } from './SettingsScreen.js'
import { DEFAULTS } from './usePreferences.js'

/**
 * A reminder that is on, permitted and scheduled for 19:00.
 *
 * Spelled out rather than defaulted inside the screen: the whole point of
 * `ReminderStatus` being required is that there is no "just draw the preference"
 * fallback branch, and a helper that quietly supplied one would put it back.
 */
const reminderOn = () => ({
  enabled: true,
  blocked: false,
  hour: 19,
  isChild: false,
  earlier: vi.fn(),
  later: vi.fn(),
  onChange: vi.fn(),
  onOpenSystemSettings: vi.fn(),
})

const renderSettings = (overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) => {
  const onChange = vi.fn()
  const result = render(
    <SettingsScreen
      version="1.2.3"
      preferences={DEFAULTS}
      onChange={onChange}
      reminder={reminderOn()}
      {...overrides}
    />,
  )
  return { ...result, onChange }
}

/** A linked account, so the sign-out row is on screen. */
const linkedAccount = (unsyncedLessons = 0) => ({
  email: 'explorer@example.com',
  onLink: vi.fn(),
  onSignIn: vi.fn(),
  onSignOut: vi.fn(),
  unsyncedLessons,
})

describe('Settings — signing out is destructive and now says so', () => {
  it('offers a plain sign-out when nothing is at risk', () => {
    renderSettings({ account: linkedAccount() })
    expect(screen.getByText('Sign out')).toBeTruthy()
    expect(screen.queryByText(/have not reached the server/i)).toBeNull()
  })

  it('names what would be lost, before the control rather than after it', () => {
    // `signOutEverywhere` calls `clearAll()` — deliberately, because a list of keys to
    // clear is a list somebody forgets to add to. The cost is that it wipes the offline
    // queue too, so a lesson finished on a plane and never synced is gone for good, and
    // one tap on a row labelled "Sign out" did it in silence. `hasUnsyncedProgress` has
    // said "used to warn before sign-out" in the engine since the queue was built.
    const { container } = renderSettings({ account: linkedAccount(3) })
    const body = container.textContent ?? ''
    expect(body).toMatch(/3 lessons have not reached the server yet/i)
    // The warning comes first. A risk stated after the button is a risk stated too late.
    expect(body.indexOf('have not reached the server')).toBeLessThan(
      body.indexOf('Sign out anyway'),
    )
  })

  it('relabels the control, so the destructive one is never the one you meant', () => {
    const account = linkedAccount(1)
    renderSettings({ account })
    expect(screen.queryByText('Sign out')).toBeNull()
    fireEvent.click(screen.getByText('Sign out anyway'))
    expect(account.onSignOut).toHaveBeenCalledOnce()
  })
})

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
  const syncProp = (over: { parked?: number; pending?: number } = {}) => {
    const parked = over.parked ?? 0
    const pending = over.pending ?? 0
    return { parked, pending, hasUnsynced: parked + pending > 0, onRetry: vi.fn() }
  }

  const withSync = (parked: number, onRetry = vi.fn()) => {
    render(
      <SettingsScreen
        reminder={reminderOn()}
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={{ ...syncProp({ parked }), onRetry }}
      />,
    )
    return onRetry
  }

  it('says nothing at all when nothing is waiting', () => {
    // A permanent "0 items waiting" row is anxiety with no cause.
    const { container } = render(
      <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} reminder={reminderOn()} sync={syncProp()} />,
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
      <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} reminder={reminderOn()} sync={syncProp({ parked: 3 })} />,
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
    <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} reminder={reminderOn()} premium={premium} />,
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

describe('Settings — work that is merely waiting', () => {
  /**
   * The section only rendered when something had exhausted its retries, so the case a
   * user is most likely to be anxious about — a lesson finished on a train thirty
   * seconds ago — showed nothing at all. `hasUnsyncedProgress` has been in the engine
   * since the queue was built, documented as the warning before sign-out, with no caller;
   * it was the last entry on the reachability gap list.
   */
  const sync = (over: { parked?: number; pending?: number }) => {
    const parked = over.parked ?? 0
    const pending = over.pending ?? 0
    return { parked, pending, hasUnsynced: parked + pending > 0, onRetry: vi.fn() }
  }

  it('says a queued lesson is on its way', () => {
    render(
      <SettingsScreen
        reminder={reminderOn()}
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={sync({ pending: 1 })}
      />,
    )
    expect(screen.getByText(/1 lesson is waiting to reach the server/i)).toBeTruthy()
  })

  it('does not offer a retry for work that has not given up', () => {
    // "Try sending again" against something already trying is a button that does
    // nothing, and a user who presses it twice learns not to trust the screen.
    render(
      <SettingsScreen
        reminder={reminderOn()}
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={sync({ pending: 2 })}
      />,
    )
    expect(screen.queryByText('Try sending again')).toBeNull()
  })

  it('still never says failed, on either message', () => {
    const { container } = render(
      <SettingsScreen
        reminder={reminderOn()}
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={sync({ pending: 3 })}
      />,
    )
    expect(container.textContent).not.toMatch(/failed|error|couldn'?t sync|problem/i)
  })

  it('accounts for both, when some has given up and some is still trying', () => {
    // A ternary on `parked > 0` said "1 lesson hasn't reached the server yet" and never
    // mentioned the other one — in the section whose whole job is to account for work
    // that has not arrived. The two sentences also end differently ("it will try again"
    // / "as soon as you're online"), so neither can stand in for the other.
    const { container } = render(
      <SettingsScreen
        reminder={reminderOn()}
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={sync({ parked: 1, pending: 2 })}
      />,
    )
    expect(container.textContent).toMatch(/1 lesson hasn'?t reached the server/i)
    expect(container.textContent).toMatch(/2 lessons are waiting to reach the server/i)
    // And the retry is offered, because one of them has in fact given up.
    expect(screen.getByText('Try sending again')).toBeTruthy()
  })

  it('stays silent when the queue is empty', () => {
    const { container } = render(
      <SettingsScreen
        reminder={reminderOn()}
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={sync({})}
      />,
    )
    // `waiting to sync` is the SECTION HEADING (`settings:section.sync`), not either
    // body message — which is what makes this assertion bite: the heading renders
    // whenever the section does, for both the parked and the pending branch. Reviewed
    // once as vacuous on the grounds that neither message contains the phrase; neither
    // does, and the heading does. The second assertion is here so that reading stays
    // wrong if somebody rewords the heading.
    expect(container.textContent).not.toMatch(/waiting to sync/i)
    expect(container.textContent).not.toMatch(/waiting to reach the server/i)
  })
})

describe('Settings — the daily reminder, which was a lie until now', () => {
  it('draws the switch from the resolved state, not from the preference', () => {
    // The preference has defaulted to ON since the first week while nothing was ever
    // scheduled. A switch bound to the preference sits proudly on while iOS drops every
    // notification, and that is the shape this feature shipped in for four months.
    render(
      <SettingsScreen
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        reminder={{ ...reminderOn(), enabled: false, blocked: true }}
      />,
    )
    expect(screen.getByRole('switch', { name: 'Daily reminder' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('says so when the phone is the thing saying no, and opens where it is fixable', () => {
    // The one state a boolean cannot express: the user said yes and the OS said no.
    // Nothing in this app can fix it, so the row states the fact and links out.
    const onOpenSystemSettings = vi.fn()
    render(
      <SettingsScreen
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        reminder={{ ...reminderOn(), enabled: false, blocked: true, onOpenSystemSettings }}
      />,
    )
    // The sentence is a note; the action is the row below it.
    expect(screen.getAllByText(/Notifications are off/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Open settings'))
    expect(onOpenSystemSettings).toHaveBeenCalledOnce()
  })

  it('offers the hour only when a reminder will actually arrive', () => {
    // An hour picker above a notification that is switched off is a control for nothing.
    render(
      <SettingsScreen
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        reminder={{ ...reminderOn(), enabled: false }}
      />,
    )
    expect(screen.queryByText('19:00')).toBeNull()
  })

  it('steps the hour without wrapping into quiet hours', () => {
    render(
      <SettingsScreen
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        // 20:00 is the last hour before quiet hours start, so there is no "later".
        // Wrapping to 08:00 on one tap would put a reminder twelve hours from where the
        // user meant it, which is the single most uninstall-worthy thing this can do.
        reminder={{ ...reminderOn(), hour: 20, later: undefined }}
      />,
    )
    expect(screen.getByText('20:00')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Later' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('tells a child account why its range stops earlier', () => {
    // Under-13 gets one a day and never after 19:00. A range that silently differs is a
    // range a parent cannot verify.
    render(
      <SettingsScreen
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        reminder={{ ...reminderOn(), hour: 18, isChild: true }}
      />,
    )
    // `getAllBy`: react-native-web renders a Text as nested divs, so the phrase matches
    // both the wrapper and the leaf. The assertion is that it is on screen at all.
    expect(screen.getAllByText(/child account/).length).toBeGreaterThan(0)
  })
})
