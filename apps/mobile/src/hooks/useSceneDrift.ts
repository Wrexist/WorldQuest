import { useCallback, useContext, useSyncExternalStore } from 'react'
import { NavigationContext } from '@react-navigation/native'
import { useDrift } from '@worldquest/design'

/** Tabs stay mounted after blur; only the visible scene should animate its scenery. */
export function useSceneDrift(phase = 0, enabled = true) {
  const navigation = useContext(NavigationContext)
  const subscribe = useCallback((listener: () => void) => {
    const focus = navigation?.addListener('focus', listener)
    const blur = navigation?.addListener('blur', listener)
    return () => { focus?.(); blur?.() }
  }, [navigation])
  const focused = useSyncExternalStore(subscribe, () => navigation?.isFocused() !== false, () => false)
  return useDrift(phase, enabled && focused)
}
