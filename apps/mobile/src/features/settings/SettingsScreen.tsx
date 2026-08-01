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
import { useT } from '../../lib/i18n.js'
import {
  DAILY_GOALS,
  LANGUAGE_CHOICES,
  type DailyGoal,
  type LanguageChoice,
  type Preferences,
} from './usePreferences.js'

export type SettingsScreenProps = {
  /** From app.json at build time; passed in so the screen stays testable. */
  readonly version: string
  readonly preferences: Preferences
  readonly onChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
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
      <Text style={styles.title} accessibilityRole="header">
        {t('settings:title')}
      </Text>

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

      <Section title={t('settings:section.language')}>
        <ChoiceRow<LanguageChoice>
          label={t('settings:section.language')}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.canvas },
  content: { padding: space[4], gap: space[5] },
  title: { ...text('h1'), color: colors.text.primary },
  // Room to scroll past the last card rather than ending flush against the tab bar.
  tail: { height: space[5] },
})
