/** A quiet canvas lets the lesson path and matte illustrations carry the color. */
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../tokens.js'

export function ScreenBackground({ children }: { children: ReactNode }) {
  return <View style={styles.canvas}>{children}</View>
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.bg.canvas },
})
