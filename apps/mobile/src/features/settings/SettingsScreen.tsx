/**
 * Settings — mockup screen 15.
 *
 * The screen a user reaches when something is already wrong for them: the sound is
 * annoying, the animation makes them queasy, the app is in the wrong language, or
 * they want to know what we collect. So every row here does something real, right
 * now. There are no rows that open a "coming soon" dialog — a settings screen that
 * lies about what it controls is worse than a shorter one.
 *
 * What is deliberately absent: export and delete. Both are GDPR obligations and both
 * arrive with accounts. Today every user is anonymous and there is nothing to export
 * that would identify them — the Privacy section says exactly that rather than
 * showing a button that cannot work.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, space, text } from '@worldquest/design'
import {
  ChoiceRow,
  LinkRow,
  Note,
  Section,
  StepperRow,
  SwitchRow,
} from '../../components/SettingsRow.js'
import { AvatarPicker } from './AvatarPicker.js'
import { useT } from '../../lib/i18n.js'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Art } from '../../components/Art.js'
import {
  DAILY_GOALS,
  LANGUAGE_CHOICES,
  type DailyGoal,
  type LanguageChoice,
  type Preferences,
} from './usePreferences.js'

/**
 * What Settings needs to know about a subscription — and nothing else.
 *
 * A flattened shape rather than the `EntitlementView` itself, so this screen stays
 * mountable by a component test and by the screenshot renderer with no engine, no
 * storage and no store SDK behind it. The route maps one to the other.
 *
 * The four booleans are not redundant. `isPaused` is a subscriber whose card failed —
 * they must see "fix your payment", NOT a paywall, and showing the wrong one loses a
 * subscriber who wanted to stay. That distinction is the entire reason this section
 * exists rather than a single "Premium: yes/no" row.
 */
export type PremiumStatus = {
  readonly isPremium: boolean
  readonly isTrialing: boolean
  /** Days until the trial charges. Null when there is no trial running. */
  readonly trialDaysLeft: number | null
  /** Grace or hold: the store could not take the money and is retrying. */
  readonly needsBillingFix: boolean
  /** Extras are paused pending a fixed card. Learning is untouched, and we say so. */
  readonly isPaused: boolean
  /**
   * They have turned renewal off but have not left yet — still a subscriber, still
   * here. Stated as a fact, once, with no offer attached: reactivation after somebody
   * has actually gone is 5 %, and this window is the only one with real odds. Nagging
   * inside it would spend that odds on nothing.
   */
  readonly isEnding: boolean
  /** Opens the store's own payment settings. The only thing that fixes a declined card. */
  readonly onFixBilling: () => void
  /** Opens the paywall. Never auto-shown from here — the user asked. */
  readonly onSeePlans: () => void
  /** Required by both stores, and by anyone who changed phone. */
  readonly onRestore: () => void
}

/**
 * The daily reminder, flattened the same way `premium` is and for the same reason.
 *
 * A reminder is not a preference — it is a preference AND an OS permission AND a
 * schedule, and only one of those three lives in `preferences`. Passing the resolved
 * shape keeps this screen presentational while letting it draw the state that actually
 * matters: the user said yes and the phone said no.
 */
export type ReminderStatus = {
  /** The preference and the permission, together. Either one false is off. */
  readonly enabled: boolean
  /** The user wants it and the OS refuses. The one state a boolean cannot express. */
  readonly blocked: boolean
  /** The hour it fires at — chosen, or learned from when this person practises. */
  readonly hour: number
  /** Under-13. Only changes the sentence under the stepper, never a capability here. */
  readonly isChild: boolean
  /** Absent at the ends of the range. Stepping never wraps into quiet hours. */
  readonly earlier?: (() => void) | undefined
  readonly later?: (() => void) | undefined
  readonly onChange: (value: boolean) => void
  /** Opens the phone's own settings page for this app. The only fix for `blocked`. */
  readonly onOpenSystemSettings: () => void
}

/**
 * The account, as Settings draws it.
 *
 * Absent entirely on a child account — the same shape as `premium`, and for a stronger
 * reason. We must not collect an email address from an under-13, so there is no flow to
 * disable; there is no flow. `useAccountStatus` explains what replaces it.
 */
export type AccountSection = {
  /** The linked address, or null while the session is still anonymous. */
  readonly email: string | null
  readonly onLink: () => void
  readonly onSignIn: () => void
  readonly onSignOut: () => void
  /**
   * Finished lessons still waiting to reach the server.
   *
   * Sign-out calls `clearAll()` — deliberately, because a list of keys to clear is a list
   * somebody forgets to add to, and the thing forgotten is the thing that leaks. The cost
   * is that it also wipes the offline queue, so a lesson finished on a plane and never
   * synced is gone for good.
   *
   * `hasUnsyncedProgress` has said "used to warn before sign-out or account deletion" in
   * the engine since the queue was built, and had no caller: one tap on a plain row threw
   * the work away in silence. Stated BEFORE the control rather than in a dialogue after
   * it, and the control gets a different label so the destructive version is never the
   * one somebody meant to press.
   */
  readonly unsyncedLessons: number
}

export type SettingsScreenProps = {
  /**
   * The way out. Optional so the component tests and the screenshot renderer mount
   * without a router, like every other screen's.
   *
   * There was none. `ScreenHeader`'s header records a sweep that gave four full-screen
   * routes a back control and explains why it matters — `/achievements` reported ZERO
   * interactive nodes to the accessibility tree, so a reader user could enter and never
   * leave. Settings was written after that sweep and shipped the same way: the gear on
   * Profile is a one-way door, and on this screen of all screens, because it holds the
   * account controls. iOS edge-swipe hides it; on web it is a hard dead end.
   */
  readonly onBack?: (() => void) | undefined
  /** From app.json at build time; passed in so the screen stays testable. */
  readonly version: string
  readonly preferences: Preferences
  readonly onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  /**
   * Work the queue could not deliver, and the user's way to try again.
   *
   * The engine PARKS a mutation that exhausted its retries rather than dropping it,
   * because "I lost my progress" is the most trust-destroying bug a learning app has.
   * Nothing surfaced them, so that promise was only half kept: the work was preserved
   * and completely unreachable. Absent (rather than zero) when there is nothing
   * waiting — a permanent "0 items waiting" row is anxiety with no cause.
   */
  /**
   * Structural rather than `SyncStatus` imported: this screen is presentational and the
   * hook lives beside it, so importing the hook's type would make the screen unmountable
   * in a test that does not want a queue.
   */
  readonly sync?:
    | {
        readonly parked: number
        readonly pending: number
        readonly hasUnsynced: boolean
        readonly onRetry: () => void
      }
    | undefined
  /**
   * Absent on a child account, and that is deliberate rather than a shortcut: Apple
   * requires commerce behind a parental gate for under-13s, and "manage subscription"
   * is commerce. The route decides; this screen simply has no premium section without
   * it, which means a new caller cannot accidentally show one.
   */
  readonly premium?: PremiumStatus | undefined
  /**
   * Required, not optional.
   *
   * An optional reminder would mean a fallback branch that draws the switch straight
   * onto the preference — which is exactly what this screen did for four months while
   * nothing was scheduled, and a branch that renders the old lie is a branch that will
   * be rendered by something.
   */
  readonly reminder: ReminderStatus
  /**
   * Absent on a child account, which gets the note below instead.
   *
   * Not "hidden": there is genuinely nothing here for them, and a disabled row asking
   * for an email is still a row asking a ten-year-old for an email.
   */
  readonly account?: AccountSection | undefined
  /**
   * The league toggle, or nothing.
   *
   * Absent when the flag is closed and absent on a child account — under-13s are never
   * placed in a cohort, and a switch offering to join one would be a switch that lies.
   * Present, it must leave in ONE tap: `social-and-leagues.md` §4 makes that a product
   * rule, so there is no confirmation and nothing to talk the user out of it.
   */
  readonly league?: { readonly joined: boolean; readonly onChange: (value: boolean) => void } | undefined
  readonly onOpenPrivacyPolicy?: (() => void) | undefined
  readonly onOpenTerms?: (() => void) | undefined
  readonly onOpenLicences?: (() => void) | undefined
}

/**
 * Purely presentational: preferences come in, changes go out.
 *
 * The hook that reads MMKV lives in the route, not here. That is not ceremony — a
 * screen that reaches into device storage cannot be mounted by the screenshot
 * renderer or by a component test, and a screen nobody can mount is a screen nobody
 * reviews. This one was written the other way round for ten minutes and the
 * screenshot build caught it immediately.
 */
export function SettingsScreen({
  version,
  preferences,
  onChange: set,
  sync,
  premium,
  reminder,
  account,
  league,
  onOpenPrivacyPolicy,
  onOpenTerms,
  onOpenLicences,
  onBack,
}: SettingsScreenProps) {
  const t = useT()

  const languageLabel = (choice: LanguageChoice): string =>
    choice === 'system'
      ? t('settings:language.system')
      : choice === 'sv'
        ? t('settings:language.sv')
        : t('settings:language.en')

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Title stays below rather than moving into the header: `ScreenHeader`'s own
          note says a screen that already carries its title takes a back control and
          nothing else, so a reader does not hear "Settings" twice. */}
      {onBack !== undefined && <ScreenHeader onBack={onBack} />}
      <Text style={styles.title} role="heading">
        {t('settings:title')}
      </Text>

      {/* A declined card goes FIRST — it is a problem the user needs to fix, and it is
          the difference between recovering a subscriber and losing one. An upsell does
          not, and sits down beside About instead. Same section, ordered by whose
          problem it is. */}
      {premium?.needsBillingFix === true && <PremiumSection premium={premium} />}

      <Section title={t('settings:section.learning')}>
        <ChoiceRow<string>
          label={t('settings:goal.label')}
          help={t('settings:goal.help')}
          value={String(preferences.dailyGoalMinutes)}
          choices={DAILY_GOALS.map((minutes) => ({
            value: String(minutes),
            label: t('settings:goal.value', { minutes }),
          }))}
          onChange={(value) => set('dailyGoalMinutes', Number(value) as DailyGoal)}
        />
        <SwitchRow
          label={t('settings:reminder.label')}
          help={t('settings:reminder.help')}
          // The resolved state, not the preference. A switch drawn from the preference
          // alone sits proudly ON while iOS quietly drops every notification, which is
          // the shape this feature shipped in and the reason nobody noticed for months.
          value={reminder.enabled}
          onChange={reminder.onChange}
        />
        {/* The one state a boolean cannot express: the user said yes and the phone said
            no. Nothing here can fix it — only the OS can — so the row states the fact
            and opens the place where it is fixable, and does not pretend the toggle
            above is doing anything. */}
        {reminder.blocked && (
          <>
            {/* The sentence as a NOTE, not as a row label. It is an explanation, and
                `rowLabel` is `bodyStrong` — the first version set a three-line bold
                paragraph next to a small grey "Open settings", which read as a section
                heading shouting at its own action. */}
            <Note body={t('settings:reminder.blocked')} />
            <LinkRow
              label={t('settings:reminder.blocked.cta')}
              onPress={reminder.onOpenSystemSettings}
            />
          </>
        )}
        {/* Only when a reminder will actually arrive. An hour picker above a
            notification that is switched off is a control for nothing. */}
        {reminder.enabled && (
          <StepperRow
            label={t('settings:reminder.time')}
            help={
              reminder.isChild
                ? t('settings:reminder.time.child.help')
                : t('settings:reminder.time.help')
            }
            value={t('settings:reminder.time.value', { hour: reminder.hour })}
            previousLabel={t('settings:reminder.earlier')}
            nextLabel={t('settings:reminder.later')}
            {...(reminder.earlier !== undefined ? { onPrevious: reminder.earlier } : {})}
            {...(reminder.later !== undefined ? { onNext: reminder.later } : {})}
          />
        )}
      </Section>

      {/* Account, directly under Learning: it is the section that decides whether any
          of the rest survives a new phone, and it was not here at all. */}
      <Section title={t('account:settings.section')}>
        {account === undefined ? (
          /* A child account. Says what is true in words a ten-year-old reads without
             alarm, and names the person who can do something about it. */
          <Note body={t('account:settings.child')} />
        ) : account.email !== null ? (
          <>
            <LinkRow label={t('account:settings.email')} value={account.email} />
            {account.unsyncedLessons > 0 ? (
              <>
                <Note
                  body={t('account:settings.signOut.unsynced', { count: account.unsyncedLessons })}
                />
                <LinkRow
                  label={t('account:settings.signOut.anyway')}
                  onPress={account.onSignOut}
                />
              </>
            ) : (
              <LinkRow label={t('account:settings.signOut')} onPress={account.onSignOut} />
            )}
          </>
        ) : (
          <>
            {/* The state, before the offer. "No account yet" is a fact rather than a
                warning — nothing is wrong, and the row below says what it buys. */}
            <LinkRow label={t('account:settings.anonymous')} />
            <LinkRow label={t('account:settings.link')} onPress={account.onLink} />
            <LinkRow label={t('account:settings.signIn')} onPress={account.onSignIn} />
          </>
        )}
      </Section>

      {league !== undefined && (
        <Section title={t('league:settings.label')}>
          <SwitchRow
            label={t('league:settings.label')}
            // Says what is shared BEFORE asking them to opt in, which is the whole
            // reason the handle is assigned rather than chosen: there is no name to
            // show, so the sentence can promise there isn't one.
            help={t('league:settings.help')}
            value={league.joined}
            onChange={league.onChange}
          />
        </Section>
      )}

      <Section title={t('settings:section.sound')}>
        <SwitchRow
          label={t('settings:sound.label')}
          value={preferences.sound}
          onChange={(value) => set('sound', value)}
        />
        <SwitchRow
          label={t('settings:haptics.label')}
          value={preferences.haptics}
          onChange={(value) => set('haptics', value)}
        />
        <SwitchRow
          label={t('settings:motion.label')}
          help={t('settings:motion.help')}
          value={preferences.reduceMotion}
          onChange={(value) => set('reduceMotion', value)}
        />
      </Section>

      <Section title={t('settings:section.appearance')}>
        {/* Twelve portraits shipped and nothing could choose between them, so every
            user was initials. The set exists to cover a real range of skin tones, ages,
            hair textures and head coverings — a set nobody can pick from does none of
            that. No uploads, ever: a child-safety rule, not a scope cut. */}
        <AvatarPicker
          value={preferences.avatar}
          onChange={(value) => set('avatar', value)}
        />
      </Section>

      <Section title={t('settings:section.language')}>
        <ChoiceRow<LanguageChoice>
          label={t('settings:language.label')}
          value={preferences.language}
          choices={LANGUAGE_CHOICES.map((choice) => ({
            value: choice,
            // Language names are written in their own language, always. "Swedish"
            // is no help to someone who has accidentally set the app to a language
            // they cannot read — "Svenska" is.
            label: languageLabel(choice),
          }))}
          onChange={(value) => set('language', value)}
        />
      </Section>

      {premium !== undefined && premium.needsBillingFix === false && (
        <PremiumSection premium={premium} />
      )}

      {sync !== undefined && sync.hasUnsynced && (
        <Section title={t('settings:section.sync')}>
          {/* The paper aeroplane, still flying, with its dotted trail behind it —
              briefed as "self-sufficient, still going". This is the one screen in the
              app that talks about work not yet delivered, and the section's whole job
              is to say the work is safe rather than lost. */}
          <View style={styles.syncArt}>
            <Art name="states/offline" size={96} />
          </View>
          {/* States what is true and what happens next. Never "sync failed" — the
              work is safe, it just has not arrived, and a child reading "failed"
              hears "your lessons are gone". */}
          {/* Both, when both are true, rather than one or the other. These were a
              ternary on `parked > 0`, so a queue holding one parked lesson and one still
              trying said "1 lesson hasn't reached the server yet" and never mentioned the
              second — in the one section whose entire job is to account for work that has
              not arrived. They are different facts with different endings ("it will try
              again" / "as soon as you're online"), so neither can stand in for the
              other. */}
          {sync.parked > 0 && <Note body={t('settings:sync.waiting', { count: sync.parked })} />}
          {/* Queued and still trying, which the section could not previously say. It only
              appeared once work had exhausted its retries, so a lesson finished on a
              train — the case a user is most likely to be anxious about, and the one that
              is most certainly fine — showed nothing at all. */}
          {sync.pending > 0 && <Note body={t('settings:sync.pending', { count: sync.pending })} />}
          {sync.parked > 0 && (
            <LinkRow label={t('settings:sync.retry')} onPress={sync.onRetry} />
          )}
        </Section>
      )}

      <Section title={t('settings:section.privacy')}>
        <SwitchRow
          label={t('settings:privacy.analytics.label')}
          help={t('settings:privacy.analytics.help')}
          value={preferences.analytics}
          onChange={(value) => set('analytics', value)}
        />
        <LinkRow label={t('settings:privacy.policy')} onPress={onOpenPrivacyPolicy} />
        <LinkRow label={t('settings:privacy.terms')} onPress={onOpenTerms} />
        <Note
          title={t('settings:privacy.account.title')}
          body={t('settings:privacy.account.body')}
        />
      </Section>

      <Section title={t('settings:section.about')}>
        <LinkRow label={t('settings:about.version')} value={version} />
        <LinkRow label={t('settings:about.licences')} onPress={onOpenLicences} />
        <Note body={t('settings:about.credits')} />
      </Section>

      <View style={styles.tail} />
    </ScrollView>
  )
}

/**
 * Everything about the subscription, in one place a user can find.
 *
 * Three audiences, three different first rows:
 *
 * - **A card that failed.** The body says the learning is safe BEFORE it offers the
 *   fix, because the fear is losing the streak, not the cosmetics. A third of Play
 *   Store cancellations are involuntary; this row is how they come back.
 * - **A subscriber.** Status, and the honest place to cancel. Burying cancellation is
 *   the oldest dark pattern in subscriptions and it converts into one-star reviews and
 *   chargebacks rather than retention.
 * - **Everyone else.** One row, no badge, no red dot. They came here for the sound
 *   toggle.
 *
 * Restore is always present. Both stores require it, and phones get replaced.
 */
function PremiumSection({ premium }: { premium: PremiumStatus }) {
  const t = useT()

  return (
    <Section title={t('settings:section.premium')}>
      {premium.needsBillingFix ? (
        <>
          <Note title={t('paywall:billing.title')} body={t('paywall:billing.body')} />
          <LinkRow label={t('paywall:billing.fix')} onPress={premium.onFixBilling} />
        </>
      ) : premium.isEnding ? (
        <Note body={t('settings:premium.ending')} />
      ) : premium.isTrialing && premium.trialDaysLeft !== null ? (
        // Says when the charge lands, unprompted. Apple sends its own reminder; ours
        // arrives first and is friendlier, and a user who knows the date does not file
        // the chargeback that costs us the revenue AND the fee.
        <Note body={t('settings:premium.trial', { count: premium.trialDaysLeft })} />
      ) : premium.isPremium ? (
        <Note body={t('settings:premium.active')} />
      ) : (
        <LinkRow label={t('settings:premium.see')} onPress={premium.onSeePlans} />
      )}

      {premium.isPremium && (
        // Cancelling lives in the store, not here — neither platform lets an app do it,
        // and a row that pretends otherwise sends the user in a circle.
        <LinkRow label={t('settings:premium.manage')} onPress={premium.onFixBilling} />
      )}
      <LinkRow label={t('paywall:restore')} onPress={premium.onRestore} />
    </Section>
  )
}

const styles = StyleSheet.create({
  syncArt: { alignSelf: 'center' },
  screen: { flex: 1 },
  content: { padding: space[4], gap: space[5] },
  title: { ...text('h1'), color: colors.text.primary },
  // Room to scroll past the last card rather than ending flush against the tab bar.
  tail: { height: space[5] },
})
