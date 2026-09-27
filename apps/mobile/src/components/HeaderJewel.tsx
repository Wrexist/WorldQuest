import { Image, View } from 'react-native'
import globe from '../../assets/art/header-jewels/globe.webp'
import flame from '../../assets/art/header-jewels/flame.webp'
import coins from '../../assets/art/header-jewels/coins.webp'

const images = { globe, flame, coins }
/** Transparent studio renders of the original editable GLB models. */
export function HeaderJewel({ name, size }: { name: keyof typeof images; size: number }) {
  const asset = images[name]
  return (
    <View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Image
        source={typeof asset === 'string' ? { uri: asset } : asset}
        resizeMode="contain"
        alt=""
        style={{ width: size, height: size }}
      />
    </View>
  )
}
