/** The streak's existing open action, presented with the shared explorer chest. */
import { Pressable, StyleSheet } from 'react-native'
import { radius, space } from '@worldquest/design'
import { ExplorerChestArt } from './ExplorerChestArt.js'
import { useT } from '../lib/i18n.js'
import { hapticCelebrate, hapticSelect } from '../lib/haptics.js'
import { soundUnlock } from '../lib/sound.js'

const SIZE = space[9] * 3 + space[8]

export function TreasureChest({ opened, onOpen, onReveal }: { opened: boolean; onOpen: () => void; onReveal?: (() => void) | undefined }) {
  const t = useT()
  return <Pressable testID="streak-chest" role="button" aria-label={t(opened ? 'streak:chest.opened' : 'streak:chest.open')}
    aria-disabled={opened} disabled={opened}
    onPress={() => { hapticSelect(); onOpen() }} style={({ pressed }) => [styles.frame, pressed && styles.pressed]}>
    <ExplorerChestArt size={SIZE} opened={opened} onReveal={onReveal}
      onCelebrate={() => { hapticCelebrate(); soundUnlock() }} />
  </Pressable>
}

const styles = StyleSheet.create({
  frame: { width: SIZE, height: SIZE, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xl },
  pressed: { opacity: .8 },
})
