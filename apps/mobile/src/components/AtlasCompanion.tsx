import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { ClaySurface, clayShadow, createThemeStyles, layout, radius, space, text } from '@worldquest/design'
import { useT } from '../lib/i18n.js'
import { WorldMascot, type AtlasMood } from './WorldMascot.js'
import { SceneEntrance } from './SceneEntrance.js'

/** A companion beside the task, with a single useful sentence and an optional giggle. */
export function AtlasCompanion({ message, mood = 'welcome', compact = false, style }: {
  message: string
  mood?: AtlasMood
  compact?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { styles } = useThemeValues()
  const t = useT()
  const { width, fontScale } = useWindowDimensions()
  const stacked = fontScale >= 1.5 && width < layout.maxContentWidth
  const side = compact ? space[9] + space[4] : space[9] + space[8]

  return <SceneEntrance style={style}>
    <View style={[styles.row, stacked && styles.stacked]} testID="atlas-companion">
      <WorldMascot mood={mood} onBoopLabel={t('common:atlas.boop')} style={{ width: side, height: side }} />
      <View style={[styles.bubble, stacked && styles.bubbleStacked]}>
        <ClaySurface radius={radius.xl} />
        <Text style={styles.message}>{message}</Text>
        <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.tail, stacked ? styles.tailTop : styles.tailStart]} />
      </View>
    </View>
  </SceneEntrance>
}

const useThemeValues = createThemeStyles(colors => ({ styles: StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  stacked: { flexDirection: 'column', gap: space[2] },
  bubble: { ...clayShadow(colors), flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, padding: space[4], borderRadius: radius.xl, backgroundColor: colors.bg.surface,
    borderColor: colors.border.subtle, borderWidth: 1 },
  bubbleStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch' },
  message: { ...text('body', { weight: '700' }), color: colors.text.primary },
  tail: { position: 'absolute', width: space[3], height: space[3], backgroundColor: colors.bg.surface,
    borderColor: colors.border.subtle, transform: [{ rotate: '45deg' }] },
  tailStart: { start: -space[3] / 2, top: space[5], borderStartWidth: 1, borderBottomWidth: 1 },
  tailTop: { top: -space[3] / 2, alignSelf: 'center', borderStartWidth: 1, borderTopWidth: 1 },
}) }))
