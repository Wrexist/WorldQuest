/** Reference-led Premium presentation; real store products are still unavailable. */
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef, useState } from 'react'
import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { AbsentContent, Button, Card, Spacer, createThemeStyles, radius, space, text, type AbsentState } from '@worldquest/design'
import { useT, type TranslationKey } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { hapticSelect } from '../../lib/haptics.js'
import { PRIVACY_URL, TERMS_URL } from '../../lib/links.js'
import { yearlySavingPercent, type Plan, type PurchaseResult } from './purchases.js'
import { Icon } from '../../components/Icon.js'
import { Art } from '../../components/Art.js'
import { Flag } from '../../components/Flag.js'
import { Reveal, TrialTimeline, usePlanSpring, PaywallMascot, DriftingCloud, Sheen, SelectionSparkle } from './PaywallMotion.js'

export type PaywallCountry = { readonly id: string; readonly name: string; readonly flagPath: string | undefined }
export type PaywallScreenProps = {
  readonly isChild: boolean
  readonly plans: readonly Plan[]
  readonly plansLoading?: boolean
  readonly plansFailed?: boolean
  readonly isOffline?: boolean
  readonly onRetryPlans?: (() => void) | undefined
  readonly trialOnRecord?: boolean
  readonly countries: readonly PaywallCountry[]
  readonly onPurchase: (planId: Plan['id']) => Promise<PurchaseResult>
  readonly onRestore: () => Promise<PurchaseResult>
  readonly onDismiss: () => void
  readonly source: 'onboarding' | 'hearts' | 'settings' | 'stats'
}
const ABSENT_MESSAGE: Record<AbsentState, TranslationKey> = {
  loading: 'paywall:plans.loading', offline: 'paywall:plans.offline', error: 'paywall:plans.failed', unavailable: 'paywall:plans.none',
}
const PERKS = [['heart', 'paywall:perk.hearts'], ['offline', 'paywall:perk.offline'], ['star', 'paywall:perk.stats'], ['gem', 'paywall:perk.cosmetics']] as const

export function PaywallScreen(props: PaywallScreenProps) {
  const { isChild, source, trialOnRecord = false } = props
  useEffect(() => {
    // Preserve the existing analytics contract; the layout is now a single page.
    track('paywall_shown', { source, variant: isChild ? 'parental_gate' : trialOnRecord ? '3page_trial' : '3page_purchase' })
  }, [isChild, source, trialOnRecord])
  return isChild ? <ParentalGate onContinue={props.onDismiss} /> : <Offer {...props} />
}
function Offer({ plans, plansLoading = false, plansFailed = false, isOffline = false, onRetryPlans,
  countries, onPurchase, onRestore, onDismiss, source }: PaywallScreenProps) {
  const { styles, colors } = useStyles()
  const t = useT()
  const { width, height, fontScale } = useWindowDimensions()
  const [selected, setSelected] = useState<Plan['id']>('annual')
  const [footerHeight, setFooterHeight] = useState(0)
  const inlineFooter = fontScale > 1.3 || footerHeight > height * 0.35
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)
  // A store may return only one product or withdraw the selected product.
  const chosen = plans.find(p => p.id === selected) ?? plans.find(p => p.id === 'annual') ?? plans[0]
  const trial = chosen?.trialEligible === true && chosen.trialDays > 0
  const saving = yearlySavingPercent(plans)
  const absent: AbsentState = isOffline ? 'offline' : plansLoading ? 'loading' : plansFailed ? 'error' : 'unavailable'
  const cycle = chosen ? t(chosen.id === 'annual' ? 'paywall:renewal.year' : 'paywall:renewal.month', { price: chosen.price }) : ''
  const transact = async (restore = false) => {
    if (inFlight.current || (!restore && !chosen)) return
    inFlight.current = true; setBusy(true); setFailed(false)
    if (!restore && chosen) track('plan_selected', { plan: chosen.id, with_trial: trial })
    try {
      const result = restore ? await onRestore() : await onPurchase(chosen!.id)
      if (result.kind === 'purchased' || result.kind === 'already-owned') onDismiss()
      else if (result.kind === 'failed') { track('purchase_failed', { reason: result.reason }); setFailed(true) }
    } catch { setFailed(true) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const footer = <View onLayout={event => setFooterHeight(previous => Math.max(previous, event.nativeEvent.layout.height))} style={[styles.footer, inlineFooter && styles.footerInline]}>
      {chosen && <Reveal order={4}>
        <Button label={trial ? t('paywall:cta.days', { days: chosen.trialDays }) : t('paywall:cta.buy')} onPress={() => void transact()} loading={busy} testID="paywall-buy" fullWidth size="lg" />
        <Reveal key={`${chosen.id}-${trial}`} order={0}><Text style={styles.terms}>
          {trial ? t('paywall:terms.offer', { days: chosen.trialDays, cycle }) : t('paywall:terms.renewal', { cycle })}
        </Text></Reveal>
      </Reveal>}
      <View style={styles.links}>
        {TERMS_URL && <Pressable role="link" onPress={() => void Linking.openURL(TERMS_URL!)} style={styles.link}><Text style={styles.linkText}>{t('settings:privacy.terms')}</Text></Pressable>}
        {PRIVACY_URL && <Pressable role="link" onPress={() => void Linking.openURL(PRIVACY_URL!)} style={styles.link}><Text style={styles.linkText}>{t('settings:privacy.policy')}</Text></Pressable>}
        {plans.length > 0 && <Pressable role="button" disabled={busy} aria-disabled={busy} onPress={() => void transact(true)} style={styles.link}><Text style={styles.linkText}>{t('paywall:restore')}</Text></Pressable>}
      </View>
    </View>
  return <View style={styles.screen}>
    <View style={styles.topbar}>
      <Text style={styles.brand}>{t('paywall:brand')}</Text>
      <Pressable role="button" accessibilityLabel={t('paywall:dismiss')} onPress={onDismiss} style={styles.dismiss}>
        <Text style={styles.dismissText}>{t('paywall:dismiss')}</Text><Icon name="close" size={space[4]} color={colors.text.secondary} />
      </Pressable>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <LinearGradient pointerEvents="none" colors={[colors.journey.sky, colors.bg.canvas]} style={StyleSheet.absoluteFill} />
        <DriftingCloud style={[styles.cloud, styles.cloudStart]}><View style={styles.cloudLobe} /><View style={styles.cloudLobeSmall} /></DriftingCloud>
        <DriftingCloud reverse style={[styles.cloud, styles.cloudEnd]}><View style={styles.cloudLobe} /><View style={styles.cloudLobeSmall} /></DriftingCloud>
        <Reveal order={0} hero><PaywallMascot /></Reveal>
      </View>
      <Reveal order={1}>
        <Text style={styles.title} role="heading" aria-level={1}>
          {plans.length === 0 ? t('paywall:title.unavailable') : t('paywall:hero.title')}
          {trial && <Text style={styles.accent}>{'\n'}{t('paywall:hero.trial', { days: chosen.trialDays })}</Text>}
        </Text>
        <View style={styles.subtitleRow}><Text style={styles.subtitle}>{t('paywall:hero.subtitle')}</Text>
          {trial && <Sheen style={{ borderRadius: radius.sm }}><Text style={styles.noCharge}>{t('paywall:trial.noCharge')}</Text></Sheen>}
        </View>
        {source === 'onboarding' && countries.length > 0 && <View style={styles.practice}>
          <Text style={styles.caption}>{t('paywall:title.value', { count: countries.length })}</Text>
          <View style={styles.flags}>{countries.map(country => <Flag key={country.id} path={country.flagPath} width={space[5]} label={country.name} />)}</View>
        </View>}
      </Reveal>
      <Reveal order={2}>
        {plans.length > 0 ? <Card style={styles.details}>
          {trial ? <TrialTimeline days={chosen.trialDays} cycle={cycle} /> : <Text style={styles.detailsTitle}>{t('paywall:plans.includes')}</Text>}
          <View style={styles.perks}>{PERKS.map(([icon, key]) => <View key={key} style={styles.perk}>
            <Icon name={icon} size={space[4]} color={colors.action.secondary} /><Text style={styles.perkText}>{t(key)}</Text>
          </View>)}</View>
        </Card> : <AbsentContent state={absent} minHeight={space[9] * 3} borderRadius={radius.xl} label={t(ABSENT_MESSAGE[absent])}>
          {(absent === 'offline' || absent === 'error') && <Art name={absent === 'offline' ? 'states/offline' : 'states/error-generic'} size={space[9]} />}
          <Text style={styles.subtitle} aria-hidden>{t(ABSENT_MESSAGE[absent])}</Text>
          {absent === 'error' && onRetryPlans && <Button label={t('common:retry')} onPress={onRetryPlans} fullWidth={false} />}
        </AbsentContent>}
      </Reveal>
      {plans.length > 0 && <Reveal order={3}><View style={[styles.plans, (width < 350 || fontScale > 1.3) && styles.plansStack]} role="radiogroup" aria-label={t('paywall:plans.choose')}>
        {(['monthly', 'annual'] as const).flatMap(id => {
          const plan = plans.find(p => p.id === id)
          return plan ? [<PlanOption key={id} plan={plan} selected={chosen?.id === id} disabled={busy} saving={id === 'annual' ? saving : null}
            onSelect={() => { hapticSelect(); setSelected(id) }} />] : []
        })}
      </View></Reveal>}
      <Reveal order={3}><Text style={styles.free}>{t('paywall:body.free')}</Text></Reveal>
      {failed && <Text style={styles.error} role="alert">{t('paywall:error.failed')}</Text>}
      {inlineFooter && footer}
    </ScrollView>
    {!inlineFooter && footer}
  </View>
}
function PlanOption({ plan, selected, saving, disabled, onSelect }: { plan: Plan; selected: boolean; saving: number | null; disabled: boolean; onSelect: () => void }) {
  const t = useT(); const { styles, colors } = useStyles(); const scale = usePlanSpring(selected)
  const label = t(plan.id === 'annual' ? 'paywall:plan.annual' : 'paywall:plan.monthly')
  const cycle = t(plan.id === 'annual' ? 'paywall:renewal.year' : 'paywall:renewal.month', { price: plan.price })
  const trial = plan.trialEligible && plan.trialDays > 0
  const offer = trial ? t('paywall:plan.trial', { days: plan.trialDays }) : cycle
  return <Animated.View style={[styles.planWrap, { transform: [{ scale }] }]}>
    <Card role="radio" aria-checked={selected} aria-disabled={disabled} onPress={onSelect}
      accessibilityLabel={t('paywall:plan.accessible', { label, offer, cycle })} style={[styles.plan, selected && styles.planSelected]}>
      {saving !== null && <Sheen style={styles.badge}><Text style={styles.badgeText}>{t('paywall:plan.save', { percent: saving })}</Text></Sheen>}
      <SelectionSparkle selected={selected} /><View style={styles.planTop} aria-hidden><View style={[styles.radio, selected && styles.radioSelected]}>{selected && <Icon name="check" size={space[3]} color={colors.text.onAccent} />}</View><Text style={styles.planLabel}>{label}</Text></View>
      <Text aria-hidden style={styles.planOffer}>{offer}</Text>
      {trial && <Text aria-hidden style={styles.caption}>{t('paywall:plan.after', { cycle })}</Text>}
      {plan.id === 'annual' && <Text aria-hidden style={styles.caption}>{t('paywall:plan.perMonth', { price: plan.pricePerMonth })}</Text>}
    </Card>
  </Animated.View>
}
function ParentalGate({ onContinue }: { onContinue: () => void }) {
  const t = useT(); const { styles } = useStyles()
  return <ScrollView style={styles.screen} contentContainerStyle={styles.parent}><Spacer /><Art name="atlas/encouraging" size={space[9] * 2} />
    <Text style={styles.title} role="heading" aria-level={1}>{t('paywall:adult.title')}</Text>
    <Text style={styles.subtitle}>{t('paywall:adult.body')}</Text><Button label={t('paywall:adult.continue')} onPress={onContinue} fullWidth /><Spacer />
  </ScrollView>
}
const useStyles = createThemeStyles(colors => ({ colors, styles: StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4] },
  brand: { flexShrink: 1, ...text('overline'), color: colors.text.secondary },
  dismiss: { minHeight: space[8], flexDirection: 'row', alignItems: 'center', gap: space[2] },
  dismissText: { ...text('caption'), color: colors.text.secondary }, scroll: { flex: 1 },
  body: { paddingHorizontal: space[4], paddingBottom: space[4], gap: space[2], width: '100%', maxWidth: space[9] * 9, alignSelf: 'center' },
  hero: { alignItems: 'center', justifyContent: 'center', height: space[9] + space[8], borderRadius: radius.xl, overflow: 'hidden' },
  cloud: { position: 'absolute', width: space[9] + space[5], height: space[5], borderRadius: radius.full, backgroundColor: colors.bg.surface },
  cloudLobe: { position: 'absolute', width: space[8], height: space[8], borderRadius: radius.full, backgroundColor: colors.bg.surface, bottom: 0, start: space[4] },
  cloudLobeSmall: { position: 'absolute', width: space[6], height: space[6], borderRadius: radius.full, backgroundColor: colors.bg.surface, bottom: 0, end: space[2] },
  cloudStart: { start: 0, bottom: space[4], transform: [{ rotate: '-8deg' }] }, cloudEnd: { end: 0, bottom: space[2], transform: [{ rotate: '8deg' }] },
  title: { ...text('h2'), textAlign: 'center', color: colors.text.primary }, accent: { color: colors.action.secondary },
  subtitleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: space[2], marginTop: space[2] },
  subtitle: { ...text('caption'), textAlign: 'center', color: colors.text.secondary },
  noCharge: { ...text('caption', { weight: '700' }), color: colors.text.primary, backgroundColor: colors.option.correct, borderRadius: radius.sm, paddingHorizontal: space[2], paddingVertical: space[1] },
  practice: { alignItems: 'center', gap: space[1], marginTop: space[2] }, flags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1], justifyContent: 'center' },
  details: { padding: space[2], gap: space[3] }, detailsTitle: { ...text('overline'), textAlign: 'center', color: colors.text.secondary },
  perks: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }, perk: { flexDirection: 'row', alignItems: 'center', gap: space[1], flexBasis: '46%', flexGrow: 1 },
  perkText: { ...text('caption'), color: colors.text.secondary, flexShrink: 1 },
  plans: { flexDirection: 'row', gap: space[3], paddingTop: space[2] }, plansStack: { flexDirection: 'column' }, planWrap: { flex: 1 },
  plan: { flexGrow: 1, gap: space[1], padding: space[3], borderWidth: 2 }, planSelected: { borderColor: colors.action.secondary, backgroundColor: colors.bg.surfaceRaised },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingBottom: space[2] },
  radio: { width: space[4], height: space[4], borderWidth: 2, borderRadius: radius.full, borderColor: colors.border.strong, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { backgroundColor: colors.action.secondary, borderColor: colors.action.secondary },
  planLabel: { ...text('caption', { weight: '700' }), color: colors.text.secondary, flexShrink: 1 }, planOffer: { ...text('bodyStrong'), color: colors.text.primary },
  caption: { ...text('caption'), color: colors.text.secondary },
  badge: { position: 'absolute', top: -space[3], end: space[2], backgroundColor: colors.league.gold.start, borderRadius: radius.sm, paddingHorizontal: space[2], paddingVertical: space[1], borderWidth: 1, borderColor: colors.league.gold.edge },
  badgeText: { ...text('caption', { weight: '700' }), color: colors.league.gold.ink },
  free: { ...text('caption', { weight: '700' }), color: colors.status.progress, textAlign: 'center' }, error: { ...text('caption'), color: colors.text.primary, textAlign: 'center' },
  footer: { paddingHorizontal: space[4], paddingTop: space[2], backgroundColor: colors.bg.canvas, width: '100%', maxWidth: space[9] * 9, alignSelf: 'center' },
  footerInline: { paddingHorizontal: 0 },
  terms: { ...text('caption'), color: colors.text.secondary, textAlign: 'center', marginTop: space[2] },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[2] }, link: { minHeight: space[8], justifyContent: 'center', paddingHorizontal: space[2] },
  linkText: { ...text('caption'), color: colors.text.secondary, textDecorationLine: 'underline' },
  parent: { flexGrow: 1, alignItems: 'center', gap: space[5], padding: space[5] },
}) }))
