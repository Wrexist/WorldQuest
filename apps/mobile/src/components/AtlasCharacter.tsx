/** Compatibility adapter for existing named illustration slots. */
import { WorldMascot, type AtlasMood } from './WorldMascot.js'
export type { AtlasMood } from './WorldMascot.js'
export function AtlasCharacter({ size, height = size, mood = 'welcome', label }: {
 size: number; height?: number | undefined; mood?: AtlasMood; label?: string | undefined
}) {
 return <WorldMascot style={{ width: size, height }} mood={mood} label={label} />
}
