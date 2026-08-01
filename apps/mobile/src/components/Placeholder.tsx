/**
 * An honest "not built yet" screen.
 *
 * The navigation shell needs five destinations before four of the five screens exist.
 * The alternative — shipping tabs that render nothing, or that fake content — is worse
 * in both directions: a blank tab reads as a bug, and fake content reads as a lie the
 * first time someone taps it.
 *
 * This whole file, and the `nav:*.soon.*` keys it renders, is scaffolding. Each tab
 * deletes its own placeholder when the real screen lands
 * (docs/plan/asset-independent-work.md, Track B). When the last one goes, so does this.
 */

import { StyleSheet, Text, View } from 'react-native'
import { colors, space, text } from '@worldquest/design'
import { useT, type TranslationKey } from '../lib/i18n.js'

export type PlaceholderProps = {
  readonly titleKey: TranslationKey
  readonly bodyKey: TranslationKey
}

export function Placeholder({ titleKey, bodyKey }: PlaceholderProps) {
  const t = useT()

  return (
    <View style={styles.screen}>
      <Text style={styles.title} role="heading">
        {t(titleKey)}
      </Text>
      <Text style={styles.body}>{t(bodyKey)}</Text>
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
  body: {
    ...text('body'),
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 320,
  },
})
