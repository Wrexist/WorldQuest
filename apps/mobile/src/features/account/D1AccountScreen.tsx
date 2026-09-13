import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, Card, Skeleton, colors, layout, radius, space, text } from '@worldquest/design'
import { ScreenHeader } from '../../components/ScreenHeader.js'
import { Art } from '../../components/Art.js'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import type { useD1Account } from './useD1Account.js'

type Flow = ReturnType<typeof useD1Account>
type Props = { flow: Flow; online: boolean; onBack: () => void; onSupport: () => void; onDone: () => void }
const errorKeys: Readonly<Record<string, TranslationKey>> = {
  INVALID_CODE: 'account:d1.error.code', INVALID_CHALLENGE: 'account:d1.error.code',
  EMAIL_UNAVAILABLE: 'account:d1.error.delivery', RETRY_LATER: 'account:d1.error.rate',
  ACCOUNT_PROTECTED: 'account:d1.protected.body', CREDENTIAL_CLEANUP_REQUIRED: 'account:d1.cleanup.body',
  CREDENTIALS_INVALID: 'account:d1.error.storage', INVALID_REQUEST: 'account:d1.error.input',
  INVALID_BODY: 'account:d1.error.input', RATE_LIMITED: 'account:d1.error.rate',
}

/** H16–H18: Alex saves progress; Priya returns on another device. One action per step. */
export function D1AccountScreen({ flow, online, onBack, onSupport, onDone }: Props) {
  const t = useT(), { state } = flow
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (state.stage !== 'code') return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [state.stage])
  const remaining = Math.max(0, Math.ceil(((state.challenge?.resendAt ?? 0) - now) / 1000))
  const expired = state.challenge !== null && state.challenge.expiresAt <= now
  const button = (key: TranslationKey, action: () => void, disabled = false, variant: 'primary' | 'secondary' | 'ghost' | 'destructive' = 'primary') =>
    <Button label={t(key)} onPress={action} disabled={state.busy || disabled} variant={variant} />
  const body = (key: TranslationKey) => <Text style={styles.body}>{t(key)}</Text>
  return <View style={styles.screen}>
    <ScreenHeader title={t('account:d1.title')} onBack={onBack} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!online && state.stage !== 'done' ? <>
          <Art name="states/offline" size={space[9]} />
          <Text role="heading" style={styles.title}>{t('account:offline.title')}</Text>
          {body('account:d1.offline')}
          {button('account:d1.back', onBack)}
        </> : <>
          {state.stage === 'loading' && <View aria-busy={true} accessibilityLabel={t('account:d1.loading')} style={styles.content}>
            <Skeleton height={space[8]} /><Skeleton height={space[9]} /><Skeleton height={space[8]} />
          </View>}
          {state.stage === 'empty' && <>
            <Text role="heading" style={styles.title}>{t('account:d1.empty.title')}</Text>
            {body('account:d1.empty.body')}
            {button('account:d1.start', flow.start)}
          </>}
          {state.stage === 'account' && <>
            <Art name="atlas/encouraging" size={space[9]} />
            <Text role="heading" style={styles.title}>{t(state.account?.email ? 'account:d1.linked' : 'account:d1.guest')}</Text>
            {state.account?.email && <Text style={styles.body}>{state.account.email}</Text>}
            {state.account?.audience === 'protected' ? body('account:d1.protected.body') : <>
              {!state.account?.email && button('account:settings.link', () => flow.select('link'))}
              {button('account:signIn.title', () => flow.select('login'), false, 'secondary')}
            </>}
            {button('account:d1.delete.title', () => flow.select('delete'), false, 'ghost')}
          </>}
          {state.stage === 'audience' && <>
            <Text role="heading" style={styles.title}>{t('account:d1.age.title')}</Text>
            {body('account:d1.age.body')}
            <TextInput style={styles.field} value={state.birthYear} onChangeText={v => flow.edit('birthYear', v.replace(/\D/g, '').slice(0, 4))}
              accessibilityLabel={t('account:d1.age.label')} keyboardType="number-pad" inputMode="numeric" maxLength={4} editable={!state.busy} />
            {button('account:d1.continue', flow.recordAudience, !/^\d{4}$/.test(state.birthYear))}
          </>}
          {state.stage === 'protected' && <>
            <Text role="heading" style={styles.title}>{t('account:d1.protected.title')}</Text>
            {body('account:d1.protected.body')}
            {button('account:d1.back', onBack)}
          </>}
          {state.stage === 'email' && <>
            <Art name={state.intent === 'login' ? 'atlas/waving-back' : 'atlas/encouraging'} size={space[9]} />
            <Text role="heading" style={styles.title}>{t(state.intent === 'login' ? 'account:signIn.title' : 'account:settings.link')}</Text>
            {state.intent === 'login' && <Card>{body('account:d1.switch.body')}</Card>}
            {body('account:d1.email.body')}
            <TextInput style={styles.field} value={state.email} onChangeText={v => flow.edit('email', v)}
              accessibilityLabel={t('account:email.label')} placeholder={t('account:email.placeholder')} placeholderTextColor={colors.text.secondary}
              keyboardType="email-address" inputMode="email" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
              editable={!state.busy} onSubmitEditing={() => { if (state.email.trim()) void flow.request() }} returnKeyType="send" />
            {button('account:email.cta', flow.request, state.email.trim().length === 0)}
          </>}
          {state.stage === 'code' && <>
            <Text role="heading" style={styles.title}>{t(state.intent === 'delete' ? 'account:d1.delete.verify' : 'account:d1.code.title')}</Text>
            <Text style={styles.body}>{t('account:d1.code.body', { email: state.challenge?.email ?? state.email })}</Text>
            {state.intent === 'delete' && body('account:d1.delete.body')}
            {expired && <Text role="status" style={styles.body}>{t('account:d1.code.expired')}</Text>}
            <TextInput style={[styles.field, styles.code]} value={state.code}
              onChangeText={v => flow.edit('code', v.replace(/\D/g, '').slice(0, 8))}
              accessibilityLabel={t('account:d1.code.label')} placeholder={t('account:d1.code.placeholder')} placeholderTextColor={colors.text.secondary}
              keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8}
              editable={!state.busy} onSubmitEditing={() => { if (/^\d{8}$/.test(state.code)) void flow.verify() }} returnKeyType="done" />
            {button(state.intent === 'delete' ? 'account:d1.delete.confirm' : 'account:code.cta', flow.verify, !/^\d{8}$/.test(state.code), state.intent === 'delete' ? 'destructive' : 'primary')}
            {remaining > 0 && <Text style={styles.body}>{t('account:d1.code.wait', { seconds: remaining })}</Text>}
            {button('account:d1.code.resend', flow.resend, remaining > 0 || expired, 'secondary')}
            {button(expired ? 'account:d1.code.restart' : 'account:code.wrongEmail', flow.changeEmail, false, 'ghost')}
          </>}
          {state.stage === 'delete' && <>
            <Text role="heading" style={styles.title}>{t('account:d1.delete.title')}</Text>
            {body('account:d1.delete.body')}
            {state.account?.email && body('account:d1.delete.email')}
            {button(state.account?.email ? 'account:email.cta' : 'account:d1.delete.confirm', flow.confirmDelete, false, 'destructive')}
            {button('account:d1.cancel', onBack, false, 'ghost')}
          </>}
          {state.stage === 'recovery' && <>
            <Text role="heading" style={styles.title}>{t('account:d1.recovery.title')}</Text>
            {body('account:d1.recovery.body')}
            {body('account:d1.recovery.guest')}
            {button('account:d1.recovery.cta', flow.recover)}
            {button('account:d1.back', onBack, false, 'ghost')}
          </>}
          {state.stage === 'cleanup' && <>
            <Text role="heading" style={styles.title}>{t('account:d1.cleanup.title')}</Text>
            {body('account:d1.cleanup.body')}
            {button('account:d1.retry', flow.retryCleanup)}
          </>}
          {state.stage === 'error' && button('account:d1.retry', flow.load)}
          {state.stage === 'activation' && <>
            {body('account:d1.activation')}
            {button('account:d1.retry', flow.retryActivation)}
          </>}
          {state.stage === 'done' && <>
            <Art name="celebration/burst" size={space[9]} />
            <Text role="heading" style={styles.title}>{t(state.deleted ? 'account:d1.deleted' : state.intent === 'link' ? 'account:done.link.title' : 'account:done.signIn.title')}</Text>
            {button('account:d1.continue', onDone)}
          </>}
          {state.busy && <Text role="status" aria-live="polite" style={styles.body}>{t('account:d1.working')}</Text>}
          {state.error && <Text role="alert" aria-live="polite" style={styles.error}>{t(errorKeys[state.error] ?? 'account:error.generic')}</Text>}
        </>}
        {button('account:d1.support', onSupport, false, 'ghost')}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, minWidth: 0 }, content: { padding: space[4], gap: space[4] },
  title: { ...text('h2'), color: colors.text.primary }, body: { ...text('body'), color: colors.text.secondary },
  error: { ...text('body'), color: colors.status.error },
  field: { ...text('body'), color: colors.text.primary, backgroundColor: colors.bg.surface, borderRadius: radius.md,
    minHeight: layout.minTouchTarget, minWidth: 0, padding: space[3], borderWidth: 1, borderColor: colors.border.strong },
  code: { ...text('h2'), textAlign: 'center' },
})
