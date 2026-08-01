/**
 * The two screens a user only sees when something has already gone wrong.
 *
 * Both follow the same rule as the wrong-answer feedback: state what happened, say
 * what still works, offer the way out. Never apologise twice, never blame the user,
 * never show a stack trace to someone who did not ask for one.
 *
 * Screen catalogue H8 (error) and H9 (404).
 */

import { StyleSheet, Text, View } from 'react-native'
import { ArtSlot, Button, colors, palette, space, text } from '@worldquest/design'
import { useT, type TranslationKey } from '../lib/i18n.js'

export type FailureStateProps = {
  readonly titleKey: TranslationKey
  readonly bodyKey: TranslationKey
  readonly ctaKey: TranslationKey
  readonly onPress: () => void
  /**
   * Shown only in development. A user is not helped by a stack trace, and shipping
   * one leaks file paths and sometimes data into a screenshot they post publicly.
   */
  readonly detail?: string | undefined
}

export function FailureState({
  titleKey,
  bodyKey,
  ctaKey,
  onPress,
  detail,
}: FailureStateProps) {
  const t = useT()

  return (
    <View style={styles.screen}>
      {/* Atlas with a broken compass, when the mascot exists. The slot holds its
          place so the layout does not move when the art lands. */}
      <ArtSlot tint={palette.blue['500']} glyph="⌖" width={96} height={96} />

      <Text style={styles.title} role="heading">
        {t(titleKey)}
      </Text>
      <Text style={styles.body}>{t(bodyKey)}</Text>

      {detail !== undefined && (
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>{t('errors:crash.detail')}</Text>
          <Text style={styles.detailText}>{detail}</Text>
        </View>
      )}

      <Button label={t(ctaKey)} onPress={onPress} style={styles.cta} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[5],
    gap: space[3],
  },
  title: { ...text('h2'), color: colors.text.primary, textAlign: 'center' },
  body: { ...text('body'), color: colors.text.secondary, textAlign: 'center', maxWidth: 320 },
  cta: { marginTop: space[3] },

  detail: { gap: space[1], maxWidth: 320 },
  detailLabel: { ...text('overline'), color: colors.text.tertiary, textAlign: 'center' },
  detailText: { ...text('caption'), color: colors.text.tertiary, textAlign: 'center' },
})
