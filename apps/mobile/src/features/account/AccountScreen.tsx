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
import { Button, Card, colors, layout, radius, space, squircle, text } from '@worldquest/design'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Art } from '../../components/Art.js'
import { useT } from '../../lib/i18n.js'

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
              <Text style={styles.body}>
                {t(mode === 'link' ? 'account:link.body' : 'account:signIn.body')}
              </Text>

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
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  fill: { flex: 1 },
  content: { padding: space[4], gap: space[4] },
  body: { ...text('body'), color: colors.text.secondary },

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
