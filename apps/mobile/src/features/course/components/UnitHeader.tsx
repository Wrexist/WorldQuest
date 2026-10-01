import { createThemeStyles } from '@worldquest/design'
import { StyleSheet, Text, View } from 'react-native'
import { ProgressBar, space, text } from '@worldquest/design'
import { tContent, useT } from '../../../lib/i18n.js'
import { AdventureArt } from '../../../components/AdventureArt.js'
import type { PathUnitView } from '../pathView.js'

export type UnitHeaderProps = {
  readonly unit: PathUnitView
  readonly withAtlas: boolean
}

export function UnitHeader({ unit, withAtlas }: UnitHeaderProps) {
  const { styles } = useThemeValues()
  const t = useT()
  const title = tContent(unit.titleKey)
  const count = t('home:path.unit.progress', { done: unit.done, total: unit.nodes.length })
  return <View style={[styles.hero, withAtlas && styles.scenic]} testID="path-unit">
    <View style={styles.words}>
      <View accessible role="heading" aria-label={t('home:path.unit.heading', { number: unit.number, title })}>
        <Text style={[styles.label, withAtlas && styles.onScenery]}>{t('home:path.unit', { number: unit.number })}</Text>
        <Text style={[styles.title, withAtlas && styles.onScenery]}>{title}</Text>
      </View>
      {!withAtlas && <Text style={styles.objective}>{tContent(unit.objectiveKey)}</Text>}
      {withAtlas ? <Text style={[styles.label, styles.onScenery]}>{count}</Text> : <ProgressBar current={unit.done} total={Math.max(1, unit.nodes.length)} tone="progress" showCount={false} label={count} valueText={count} />}
    </View>
    {withAtlas && <AdventureArt name="explorer" style={{ width: 116, height: 140 }} />}
  </View>
}


const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', padding: space[4], gap: space[3], borderRadius: 18, backgroundColor: colors.journey.meadow, borderWidth: 1, borderColor: colors.border.subtle },
  scenic: { backgroundColor: 'transparent', borderWidth: 0, padding: 0, marginBottom: 12 },
  onScenery: { color: colors.text.primary },
  words: { flex: 1, gap: space[2] },
  label: { ...text('overline'), color: colors.text.secondary },
  title: { ...text('h2'), color: colors.text.primary },
  objective: { ...text('body'), color: colors.text.secondary },
  art: { width: 112, height: 128, alignItems: 'center', justifyContent: 'center' },
})
  return { colors, styles }
})
