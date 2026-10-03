/** Shared daylight, relief and clay highlights for the live globe and offline previews. */
import type { ThemeColors } from '@worldquest/design'
import { hexToRgb, type GlobeTheme } from './GlobeRenderer.js'

export function atlasTheme(colors: ThemeColors, mode: 'light' | 'dark'): GlobeTheme {
  const m = colors.map
  return {
    background: hexToRgb(colors.bg.canvas),
    halo: hexToRgb(m.atlasHalo),
    border: hexToRgb(m.atlasBorder),
    borderAlpha: mode === 'dark' ? 0.45 : 0.6,
    rim: hexToRgb(m.atlasHalo),
    states: {
      subject: hexToRgb(m.atlasSubject),
      selected: hexToRgb(m.atlasSelected),
      correct: hexToRgb(m.atlasCorrect),
      incorrect: hexToRgb(m.atlasIncorrect),
      context: hexToRgb(m.atlasContext),
    },
    flat: false,
    flatLand: hexToRgb(m.atlasFlatLand),
    flatWater: hexToRgb(m.atlasFlatWater),
    saturation: mode === 'dark' ? 1.0 : 1.3,
    water: hexToRgb(m.atlasWater),
    shadow: hexToRgb(m.atlasShadow),
  }
}

