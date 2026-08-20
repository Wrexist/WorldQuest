/**
 * Giving an anonymous account a way home — mockup-adjacent, and the last dead end.
 *
 * ## What was broken
 *
 * Every install signed in anonymously and stayed that way. `ensureSession` in
 * `packages/api` promised an anonymous session "upgrades in place later without losing a
 * day of progress"; nothing upgraded it. Uninstall, change phone, or clear storage and a
 * hundred-day streak and every mastered fact were gone, with no way back and nothing
 * support could do. Profile has carried a "Save your progress" card since the first
 * week — `onCreateAccount` — and the route passed `undefined`, so it never drew. So did
 * onboarding's "I already have an account".
 *
 * ## One screen, two directions
 *
 * Both are email, then a six-digit code, so they are one component with a `mode`:
 *
 * · **link** — attach an address to the session that is already here. The user id does
 *   not change, so every ledger row, fact and streak stays exactly where it is. This is
 *   the path for someone with progress.
 * · **signIn** — replace this device's session with an account that already exists. The
 *   path for a new phone.
 *
 * A code rather than a magic link: a link makes the user leave for their mail client and
 * return through a deep link, which is where the flow dies — in-app previews, corporate
 * link rewriters and the "open in" dialogue each eat it, and every failure looks like the
 * app being broken. The code keeps all of it on one screen.
 *
 * ## The trap this screen exists to avoid
 *
 * Signing in on a device that already has unsaved progress leaves that progress behind,
 * on an anonymous account nobody can ever reach again. It is silent, irreversible, and
 * the natural thing to do if you have used the app for a week and then spot "I already
 * have an account". So the sign-in path says so before it starts, in the same words a
 * person would use, and offers the other door.
 *
 * Purely presentational. Every decision arrives already made.
 */

import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  Button,
  Card,
  colors,
  layout,
  ProgressBar,
  radius,
  space,
  squircle,
  text,
} from '@worldquest/design'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Art } from '../../components/Art.js'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { Icon } from '../../components/Icon.js'

export type AccountMode = 'link' | 'signIn'

/** Where the flow is. The screen never decides this; the hook does. */
export type AccountStage = 'email' | 'code' | 'done'

export type AccountScreenProps = {
  readonly mode: AccountMode
  readonly stage: AccountStage
  /**
   * A request is in flight.
   *
   * This screen's loading state, and it is a disabled control rather than a skeleton
   * because nothing here is being fetched — the form is instantly available and what
   * loads is the submission. Two taps on "Send me a code" is two codes, and the second
   * invalidates the first, so the user who double-taps is handed one that will not work.
   */
  readonly loading: boolean
  /**
   * What went wrong, already translated.
   *
   * A string rather than a code because the messages differ in kind — a wrong code, an
   * address with no account, a network that is down — and mapping them is the route's
   * job. Absent means nothing has gone wrong yet, which is not the same as "fine".
   */
  readonly error?: string | undefined
  /**
   * Progress on this device that signing in would strand. Absent on the link path.
   *
   * A number, so the warning can be specific: "you have a 14-day streak here" is a
   * sentence somebody stops and reads, and "you may lose data" is one they tap past.
   */
  readonly localStreak?: number | undefined
  /**
   * No connection.
   *
   * Worth a state of its own rather than letting the attempt fail: this is the one
   * flow in the app that CANNOT work offline — everything else queues — and a user who
   * types their address, taps, waits, and gets "that didn't work" has learned nothing
   * about why. Said before they type, it is a reason to come back rather than a fault.
   */
  readonly offline?: boolean | undefined
  /** The address the code went to, for the second step to name. */
  readonly email: string
  readonly onEmail: (value: string) => void
  readonly onSubmitEmail: () => void
  readonly code: string
  readonly onCode: (value: string) => void
  readonly onSubmitCode: () => void
  /** Back to the address field — a typo'd email is the most likely reason to be stuck. */
  readonly onChangeEmail: () => void
  readonly onDone: () => void
  /** Leaves without finishing. This flow is optional and must stay leaveable. */
  readonly onBack: () => void
  /** Offered on the sign-in path when there is local progress to strand. */
  readonly onLinkInstead?: (() => void) | undefined
}

/** Six digits, and the field refuses to hold more. */
const CODE_LENGTH = 6

const HERO = 140

/**
 * The picture on the form itself, which had none.
 *
 * This screen was a paragraph, a text field and a button on a bare canvas — 61 % of a
 * 390-wide phone empty, the only screen the design harness flagged before it could
 * measure properly, and the flow that protects everything the user has done. It looked
 * like a debug page.
 *
 * Two poses, because the two modes are two different moments. `atlas/encouraging` is
 * briefed as "leaning forward, offering an open hand — reassuring, patient, not
 * pitying", which is the register of asking somebody for their address. `waving-back` is
 * "greeting someone returning after a long time", which is what signing in on a new
 * phone is. Neither is the celebration `Done` already uses.
 *
 * Smaller than `HERO`: the keyboard takes half the screen on this one, and the picture
 * is the first thing that should give way.
 */
const FORM_ART = 96

/** The tick beside each reassurance, at the size of the line it sits against. */
const ASSURE_TICK = 18

/**
 * What linking an address actually gets you, as three lines rather than one paragraph.
 *
 * The old copy said all of this in a single 160-character sentence, and a wall of
 * promises reads as a sales pitch where a short list reads as facts. Nothing new is
 * claimed: these are the same two promises the paragraph made — your progress travels,
 * and the address is used to sign you in and for nothing else — separated so each can be
 * read on its own.
 */
const ASSURANCES: readonly TranslationKey[] = [
  'account:link.assure.travels',
  'account:link.assure.anyPhone',
  'account:link.assure.onlyUse',
]

/** Address, then code. Two, and saying so is most of the reassurance. */
const STEPS = 2

export function AccountScreen({
  mode,
  stage,
  loading,
  error,
  localStreak,
  offline,
  email,
  onEmail,
  onSubmitEmail,
  code,
  onCode,
  onSubmitCode,
  onChangeEmail,
  onDone,
  onBack,
  onLinkInstead,
}: AccountScreenProps) {
  const t = useT()

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t(mode === 'link' ? 'account:link.title' : 'account:signIn.title')}
        onBack={onBack}
      />
      {/* The keyboard covers the primary button on every small phone otherwise, which
          on a two-field flow means the user cannot finish it at all. */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {offline === true && stage !== 'done' ? (
            <View style={styles.hero}>
              <Art name="states/offline" size={HERO} />
              <Text style={styles.doneTitle} role="heading">
                {t('account:offline.title')}
              </Text>
              <Text style={styles.body}>{t('account:offline.body')}</Text>
            </View>
          ) : stage === 'done' ? (
            <Done mode={mode} onDone={onDone} />
          ) : stage === 'email' ? (
            <>
              <Steps stage="email" />
              {/* Reassuring, patient, not pitying — and on a screen that had no picture
                  at all. See `FORM_ART`. Decorative: everything it says, the lines below
                  say in words. */}
              <View style={styles.formArt}>
                <Art
                  name={mode === 'link' ? 'atlas/encouraging' : 'atlas/waving-back'}
                  size={FORM_ART}
                />
              </View>
              <Text style={styles.lead}>
                {t(mode === 'link' ? 'account:link.body' : 'account:signIn.body')}
              </Text>

              {/* Only on the link path. Sign-in is somebody who has already decided —
                  they are here BECAUSE they have an account — so three reasons to have
                  one is an argument nobody asked for. */}
              {mode === 'link' && (
                <View style={styles.assurances}>
                  {ASSURANCES.map((key) => (
                    <View key={key} style={styles.assureRow}>
                      {/* Decorative — the phrase beside it says the same thing. */}
                      <Icon name="check" size={ASSURE_TICK} color={colors.status.progress} />
                      <Text style={styles.assureText}>{t(key)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* The trap, named before it is sprung. Only on the sign-in path, and only
                  when there is something here to strand — a warning that appears for
                  everyone is a warning nobody reads. */}
              {mode === 'signIn' && localStreak !== undefined && localStreak > 0 && (
                <Card level={2} style={styles.warning}>
                  <Text style={styles.warningTitle} role="heading">
                    {t('account:signIn.warning.title')}
                  </Text>
                  <Text style={styles.warningBody}>
                    {t('account:signIn.warning.body', { count: localStreak })}
                  </Text>
                  {onLinkInstead !== undefined && (
                    <Button
                      label={t('account:signIn.warning.cta')}
                      variant="secondary"
                      onPress={onLinkInstead}
                      fullWidth={false}
                    />
                  )}
                </Card>
              )}

              <TextInput
                style={styles.field}
                value={email}
                onChangeText={onEmail}
                placeholder={t('account:email.placeholder')}
                placeholderTextColor={colors.text.tertiary}
                accessibilityLabel={t('account:email.label')}
                // The four that make an email field usable on a phone, and whose absence
                // is why so many of them are miserable: the right keyboard, no
                // capitalisation of the first letter, no autocorrect "fixing" a domain,
                // and the OS offering the address it already knows.
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                autoComplete="email"
                inputMode="email"
                editable={!loading}
                onSubmitEditing={onSubmitEmail}
                returnKeyType="send"
              />

              {error !== undefined && <Text style={styles.error}>{error}</Text>}

              <Button
                label={t('account:email.cta')}
                onPress={onSubmitEmail}
                disabled={loading || email.trim().length === 0}
              />
            </>
          ) : (
            <>
              <Steps stage="code" />
              {/* Naming the address is what makes a typo findable. "We sent a code" over
                  a silent inbox is unresolvable; "we sent a code to jon@exmaple.com" is
                  solved by the user in one glance. */}
              <Text style={styles.body}>{t('account:code.body', { email })}</Text>

              <TextInput
                style={[styles.field, styles.codeField]}
                value={code}
                onChangeText={(value) => onCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                placeholder={t('account:code.placeholder')}
                placeholderTextColor={colors.text.tertiary}
                accessibilityLabel={t('account:code.label')}
                keyboardType="number-pad"
                inputMode="numeric"
                // The OS reads the code out of the incoming message and offers it above
                // the keyboard. One tap instead of six, and it is one prop.
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                editable={!loading}
                onSubmitEditing={onSubmitCode}
                returnKeyType="done"
              />

              {error !== undefined && <Text style={styles.error}>{error}</Text>}

              <Button
                label={t('account:code.cta')}
                onPress={onSubmitCode}
                disabled={loading || code.length < CODE_LENGTH}
              />
              <Button
                label={t('account:code.wrongEmail')}
                variant="ghost"
                onPress={onChangeEmail}
                disabled={loading}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

/**
 * Address, then code — and saying which of the two you are on.
 *
 * A form that does not say how long it is feels longer than it is, and this one is two
 * fields for something a person is already slightly wary of doing. `ProgressBar` rather
 * than a second convention: onboarding already puts a bar under its header for exactly
 * this, and the whole point of a design system is that a user meets the same thing twice.
 *
 * `showCount` stays on, as it is everywhere else — "1 / 2" over a half-filled bar is the
 * same fact twice, and that is the point: the bar says how far and the fraction says how
 * many, and "how many" is the reassuring half on a flow somebody is wary of starting.
 * The spoken name is a sentence rather than a fraction, because "1 slash 2" is not one.
 */
function Steps({ stage }: { readonly stage: 'email' | 'code' }) {
  const t = useT()
  const current = stage === 'email' ? 1 : STEPS
  return (
    <ProgressBar
      current={current}
      total={STEPS}
      accessibilityLabel={t('account:step', { current, total: STEPS })}
    />
  )
}

/**
 * The end of it.
 *
 * Says what is now true rather than "Success": the whole reason a person went through
 * two screens and a code was to stop being able to lose their progress, and that is the
 * sentence worth reading.
 */
function Done({ mode, onDone }: { readonly mode: AccountMode; readonly onDone: () => void }) {
  const t = useT()
  return (
    <>
      <View style={styles.hero}>
        <Art name="celebration/burst" size={HERO} />
      </View>
      <Text style={styles.doneTitle} role="heading">
        {t(mode === 'link' ? 'account:done.link.title' : 'account:done.signIn.title')}
      </Text>
      <Text style={styles.body}>
        {t(mode === 'link' ? 'account:done.link.body' : 'account:done.signIn.body')}
      </Text>
      <Button label={t('account:done.cta')} onPress={onDone} />
    </>
  )
}

const styles = StyleSheet.create({
  /**
   * No `backgroundColor`.
   *
   * It painted `bg.canvas` flat over the root gradient, which `ScreenBackground`'s own
   * header calls out as the thing that made the token unreachable — "a flat fill on top
   * of a gradient is just a flat fill". This screen and League were the two stragglers,
   * and it is why they read as flat black beside Home's atmosphere.
   */
  screen: { flex: 1 },
  fill: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  body: { ...text('body'), color: colors.text.secondary },
  // Centred, unlike `body`. It sits under a centred picture and above a centred list,
  // and a left-aligned sentence between them reads as a stray paragraph.
  lead: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },

  formArt: { alignItems: 'center' },
  // `alignSelf: 'center'`, so the block is centred while its lines stay left-aligned
  // against each other — three centred phrases of different lengths make a ragged
  // diamond, which is the shape of a poem rather than of a list of facts.
  assurances: { alignSelf: 'center', gap: space[2] },
  assureRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  assureText: { ...text('body'), color: colors.text.secondary, flexShrink: 1 },

  field: {
    ...text('body'),
    color: colors.text.primary,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    ...squircle,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: space[4],
    // The touch-target floor on a control the user has to hit precisely, and which is
    // the only thing on screen between them and their account.
    minHeight: layout.minTouchTarget,
  },
  codeField: { ...text('h2'), color: colors.text.primary, textAlign: 'center', letterSpacing: 8 },

  error: { ...text('caption'), color: colors.status.error },

  warning: { gap: space[2] },
  warningTitle: { ...text('bodyStrong'), color: colors.text.primary },
  warningBody: { ...text('caption'), color: colors.text.secondary },

  hero: { alignItems: 'center' },
  doneTitle: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
})
