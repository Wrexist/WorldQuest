import { useSyncExternalStore } from 'react'
import { useColorScheme } from 'react-native'
import { colors, darkColors } from './tokens.js'

export type AppearanceChoice = 'light' | 'dark' | 'system'
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> }
export type ThemeColors = Widen<typeof colors>
let appearance: AppearanceChoice = 'system'
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const snapshot = () => appearance

/** Persistence belongs to the app's existing preferences, never to this package. */
export function setAppearance(value: AppearanceChoice): void {
  if (appearance === value) return
  appearance = value
  listeners.forEach(listener => listener())
}

export function useTheme() {
  const choice = useSyncExternalStore(subscribe, snapshot, snapshot)
  const system = useColorScheme()
  const mode = choice === 'system' ? system === 'dark' ? 'dark' : 'light' : choice
  return { mode, choice, colors: (mode === 'dark' ? darkColors : colors) as ThemeColors }
}

/** Build each module's styles once per palette; a switch preserves component state. */
export function createThemeStyles<T>(factory: (colors: ThemeColors) => T): () => T {
  const cache = new WeakMap<ThemeColors, T>()
  return function useThemeStyles(): T {
    const { colors } = useTheme()
    if (!cache.has(colors)) cache.set(colors, factory(colors))
    return cache.get(colors)!
  }
}
