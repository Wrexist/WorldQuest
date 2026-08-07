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
import { ChoiceRow, LinkRow, Note, Section, SwitchRow } from '../../components/SettingsRow.js'
import { AvatarPicker } from './AvatarPicker.js'
import { useT } from '../../lib/i18n.js'
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

export type SettingsScreenProps = {
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
  onOpenPrivacyPolicy,
  onOpenTerms,
  onOpenLicences,
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
          value={preferences.reminder}
          onChange={(value) => set('reminder', value)}
        />
      </Section>

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
          {sync.parked > 0 ? (
            <Note body={t('settings:sync.waiting', { count: sync.parked })} />
          ) : (
            /* Queued and still trying, which the section could not previously say. It
               only appeared once work had exhausted its retries, so a lesson finished on
               a train — the case a user is most likely to be anxious about, and the one
               that is most certainly fine — showed nothing at all. */
            <Note body={t('settings:sync.pending', { count: sync.pending })} />
          )}
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
