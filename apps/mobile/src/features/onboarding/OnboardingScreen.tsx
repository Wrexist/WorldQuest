import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Button, Card, ProgressBar, createThemeStyles, layout, space, text } from '@worldquest/design'
import { LOCALE_ENDONYM } from '@worldquest/i18n'
import { useT } from '../../lib/i18n.js'
import { track } from '../../lib/analytics.js'
import { hapticSelect } from '../../lib/haptics.js'
import { DEFAULTS, LANGUAGE_CHOICES, type DailyGoal, type LanguageChoice } from '../settings/usePreferences.js'
import { Art } from '../../components/Art.js'
import { Icon } from '../../components/Icon.js'
import { LaunchHero } from '../../components/LaunchHero.js'
import { CloudBackdrop } from '../../components/CloudBackdrop.js'
import { SceneEntrance } from '../../components/SceneEntrance.js'
import { WheelPicker, type WheelOption } from '../../components/WheelPicker.js'
import { OnboardingDemo } from './OnboardingDemo.js'
import type { LevelChoice } from './levels.js'

export const CHILD_AGE = 13
export type OnboardingResult = {
  readonly birthYear: number
  readonly isChild: boolean
  readonly dailyGoalMinutes: DailyGoal
  readonly language: LanguageChoice
  readonly startRegion: string | null
  readonly level: LevelChoice
}
export type OnboardingScreenProps = {
  readonly currentYear: number
  readonly language: LanguageChoice
  readonly onLanguage: (choice: LanguageChoice) => void
  readonly onFinish: (result: OnboardingResult) => void
  readonly onSignIn?: (() => void) | undefined
  readonly countryCount?: number | undefined
}

type Step = 'welcome' | 'language' | 'age' | 'taster'
const OLDEST = 100
const OPENS_AT = 2000

/** Only age is required before learning. Preferences remain editable in Settings. */
export function OnboardingScreen({ currentYear, language, onLanguage, onFinish, onSignIn }: OnboardingScreenProps) {
  const { styles } = useStyles()
  const t = useT()
  const window = useWindowDimensions()
  const [step, setStep] = useState<Step>('welcome')
  const [demoOpen, setDemoOpen] = useState(false)
  const [birthYear, setBirthYear] = useState<number | null>(null)
  const finished = useRef(false)
  const scroll = useRef<ScrollView>(null)
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
    scroll.current?.scrollTo({ y: 0, animated: false })
  }, [step])
  useEffect(() => () => {
    if (!finished.current) track('onboarding_abandoned', { last_step: stepRef.current })
  }, [])
  const years = useMemo<readonly WheelOption<number>[]>(() => [
    { value: null, label: t('onboarding:age.none') },
    ...Array.from({ length: OLDEST + 1 }, (_, offset) => ({ value: currentYear - offset, label: String(currentYear - offset) })),
  ], [currentYear, t])
  const isChild = birthYear !== null && currentYear - birthYear < CHILD_AGE
  const heroSize = Math.min(window.width - space[6], window.height * (step === 'welcome' && window.height < 700 ? .23 : .32), space[9] * 5)
  const go = (next: Step) => { hapticSelect(); setStep(next) }
  const finish = () => {
    if (birthYear === null || finished.current) return
    finished.current = true
    onFinish({ birthYear, isChild, language, dailyGoalMinutes: DEFAULTS.dailyGoalMinutes,
      startRegion: DEFAULTS.startRegion, level: DEFAULTS.startLevel })
  }

  if (demoOpen) return <OnboardingDemo onBack={() => setDemoOpen(false)}
    onContinue={() => { setDemoOpen(false); go('age') }} />

  return <View style={styles.root}>
    <View style={styles.chrome}>
      {step === 'welcome'
        ? <Button variant="ghost" label={t('onboarding:language.change')} onPress={() => go('language')} />
        : <Button variant="ghost" label={t('onboarding:back')} onPress={() => go(step === 'taster' ? 'age' : 'welcome')} />}
      {(step === 'age' || step === 'taster') && <View style={styles.progress}>
        <ProgressBar current={step === 'age' ? 1 : 2} total={2} showCount={false}
          valueText={t('onboarding:progress', { step: step === 'age' ? 1 : 2, total: 2 })} />
      </View>}
    </View>
    <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.spacer} />
      <SceneEntrance replayKey={step} style={styles.scene}>
        {step === 'welcome' && <>
          <LaunchHero size={heroSize} />
          <Text role="heading" maxFontSizeMultiplier={1.3} style={styles.wordmark}>{t('splash:wordmark')}</Text>
          <Text style={styles.body}>{t('onboarding:welcome.body')}</Text>
        </>}
        {step === 'language' && <>
          <Text role="heading" style={styles.title}>{t('onboarding:language.title')}</Text>
          <View style={styles.choices} role="radiogroup" aria-label={t('onboarding:language.title')}>
            {LANGUAGE_CHOICES.map(choice => <Card key={choice} role="radio" aria-checked={language === choice}
              tone={language === choice ? 'sky' : 'ice'} onPress={() => { hapticSelect(); onLanguage(choice) }}>
              <View style={styles.languageRow}>
                <Text style={styles.choice}>{choice === 'system' ? t('onboarding:language.system') : LOCALE_ENDONYM[choice]}</Text>
                {language === choice && <Icon name="check" size={space[5]} />}
              </View>
            </Card>)}
          </View>
        </>}
        {step === 'age' && <>
          <Art name="atlas/thinking" size={space[9] * 2} />
          <Text role="heading" style={styles.title}>{t('onboarding:age.title')}</Text>
          <Text style={styles.body}>{t('onboarding:age.body')}</Text>
          <View style={styles.choices}>
            <WheelPicker options={years} value={birthYear} onChange={setBirthYear} label={t('onboarding:age.year')}
              restingIndex={years.findIndex(year => year.value === OPENS_AT)} />
          </View>
          {isChild && <Card style={styles.choices}>
            <Text style={styles.childTitle}>{t('onboarding:age.child.title')}</Text>
            <Text style={styles.body}>{t('onboarding:age.child.body')}</Text>
          </Card>}
        </>}
        {step === 'taster' && <>
          <View style={styles.hero}><CloudBackdrop /><Art name="atlas/welcome" size={heroSize} /></View>
          <Text role="heading" style={styles.title}>{t('onboarding:taster.title')}</Text>
          <Text style={styles.body}>{t('onboarding:taster.body')}</Text>
          <Card style={styles.choices}><Text style={styles.body}>{t('onboarding:taster.preferences')}</Text></Card>
        </>}
      </SceneEntrance>
      <View style={styles.spacer} />
    </ScrollView>
    <View style={styles.actions}>
      {step === 'welcome' && <>
        <Button label={t('onboarding:cta.start')} onPress={() => go('age')} />
        <Button variant="secondary" label={t('onboarding:demo.open')} onPress={() => setDemoOpen(true)} />
        {onSignIn && <Button variant="ghost" label={t('onboarding:cta.haveAccount')} onPress={onSignIn} />}
      </>}
      {step === 'language' && <Button label={t('onboarding:age.continue')} onPress={() => go('welcome')} />}
      {step === 'age' && <Button label={t('onboarding:age.continue')} disabled={birthYear === null} onPress={() => go('taster')} />}
      {step === 'taster' && <Button label={t('onboarding:taster.start')} onPress={finish} />}
    </View>
  </View>
}

const useStyles = createThemeStyles(colors => ({ colors, styles: StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.canvas },
  chrome: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[3] },
  progress: { flex: 1 },
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, padding: space[4] },
  spacer: { flexGrow: 1 },
  scene: { alignItems: 'center', gap: space[4], flexShrink: 0, width: '100%', maxWidth: layout.maxContentWidth - space[4] * 2, alignSelf: 'center' },
  hero: { alignSelf: 'stretch', alignItems: 'center' },
  wordmark: { ...text('display'), color: colors.text.primary, textAlign: 'center' },
  title: { ...text('h1'), color: colors.text.primary, textAlign: 'center' },
  childTitle: { ...text('h3'), color: colors.text.primary, textAlign: 'center', marginBottom: space[2] },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  choice: { ...text('body'), color: colors.text.primary, flex: 1 },
  languageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  choices: { alignSelf: 'stretch', gap: space[3] },
  actions: { padding: space[4], gap: space[2], backgroundColor: colors.bg.canvas, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
}) }))
