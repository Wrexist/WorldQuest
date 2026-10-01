import { createThemeStyles } from '../theme.js'
﻿/** A quiet canvas lets the lesson path and matte illustrations carry the color. */
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'


export function ScreenBackground({ children }: { children: ReactNode }) {
  const { styles } = useThemeValues()
  return <View style={styles.canvas}>{children}</View>
}



const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.bg.canvas },
})
  return { colors, styles }
})
