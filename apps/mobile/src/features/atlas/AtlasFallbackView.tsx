/**
 * The simpler map, for when the globe is off or cannot run — the same scene, flat.
 *
 * Driven by the SAME spec as the globe, so it discloses exactly what the globe would:
 * the country's locator picture (already shipped, from the same Natural Earth source),
 * and after a capital question the capital's name as text. It draws no pin and accepts
 * no taps: a static picture cannot honestly offer precise location, so it does not
 * pretend to.
 */

import { StyleSheet, Text, View } from 'react-native'
import { createThemeStyles, radius, space, text } from '@worldquest/design'
import { CountryMap } from '../../components/CountryMap.js'
import { useT } from '../../lib/i18n.js'
import type { AtlasSceneSpec } from './scene/types.js'

export type AtlasFallbackViewProps = {
  readonly spec: AtlasSceneSpec
  /** The pack's locator layers for the focused country. */
  readonly locator: { readonly path: string; readonly contextPath: string } | undefined
  readonly width: number
}

export function AtlasFallbackView({ spec, locator, width }: AtlasFallbackViewProps) {
  const { styles } = useThemeValues()
  const t = useT()
  const pin = spec.markers.find((m) => m.emphasis === 'answer' && m.label !== null)
  return (
    <View style={styles.column} testID="atlas-fallback">
      <CountryMap
        path={locator?.path}
        contextPath={locator?.contextPath}
        width={width}
        // The spec's summary obeys the disclosure policy, so it is safe as the label.
        label={spec.summary}
      />
      {pin?.label != null && (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{t('atlas:fallback.capital', { capital: pin.label })}</Text>
        </View>
      )}
    </View>
  )
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    column: { alignItems: 'center', gap: space[2] },
    chip: {
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: radius.full,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    chipText: { ...text('body', { weight: '700' }), color: colors.text.primary },
  })
  return { styles }
})
