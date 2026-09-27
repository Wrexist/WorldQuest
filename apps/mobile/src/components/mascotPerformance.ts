/** Authored motion curves, in rig units. Geometry is sampled once, never on the JS frame loop. */
export type MascotMood = 'welcome' | 'celebrate' | 'thinking' | 'resting' | 'encouraging'
export const RIG = { size: 300, hips: { x: 140, y: 232 }, rightShoulder: { x: 226, y: 170 }, leftShoulder: { x: 62, y: 174 }, eyesY: 126 } as const
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }
const pulse = (t: number, start: number, end: number) => t <= start || t >= end ? 0 : Math.sin(Math.PI * (t - start) / (end - start)) ** 2
const envelope = (t: number, start: number, end: number) => smooth((t - start) / .12) * (1 - smooth((t - end + .18) / .18))
export const FRAME_TIMES = Array.from({ length: 121 }, (_, i) => i / 120)
export function performanceAt(mood: MascotMood, t: number) {
  // Small, asymmetric gestures read as intentional acting, not a metronome.
  const greeting = envelope(t, .08, .87)
  const wave = Math.sin((t - .08) * Math.PI * 7) * greeting
  const anticipation = pulse(t, .04, .24)
  const airborne = pulse(t, .24, .66)
  const landing = pulse(t, .66, .87)
  const celebrate = mood === 'celebrate'
  const welcome = mood === 'welcome'
  const thinking = mood === 'thinking'
  const encourage = mood === 'encouraging'
  return {
    jump: celebrate ? -10 * airborne : 0,
    bodyY: celebrate ? 2.5 * anticipation + 1.8 * landing : encourage ? 1.2 * pulse(t, .18, .65) : 0,
    bodyTilt: welcome ? -1.4 * pulse(t, .1, .92) : thinking ? 3 * pulse(t, .06, .97) : encourage ? -1.5 * pulse(t, .12, .8) : celebrate ? -2 * airborne : 0,
    squash: celebrate ? -.025 * anticipation + .012 * airborne - .018 * landing : 0,
    rightArm: welcome ? 9 * wave : celebrate ? -17 * pulse(t, .1, .84) : thinking ? 5 * pulse(t, .15, .95) : encourage ? -6 * pulse(t, .14, .86) : 0,
    leftArm: celebrate ? 12 * pulse(t, .16, .88) : welcome ? 1.5 * pulse(t, .16, .93) : 0,
    scarf: welcome ? 1.4 * Math.sin(t * Math.PI * 5) * envelope(t, .2, .98) : celebrate ? 3 * Math.sin(t * Math.PI * 4) * envelope(t, .23, .98) : 0,
    gazeX: thinking ? -3 * pulse(t, .08, .97) : welcome ? 1.2 * pulse(t, .15, .85) : 0,
    gazeY: thinking ? -2 * pulse(t, .08, .97) : 0,
  }
}
export const PERFORMANCES = Object.fromEntries((['welcome', 'celebrate', 'thinking', 'resting', 'encouraging'] as const).map(mood => [mood, FRAME_TIMES.map(t => performanceAt(mood, t))])) as Record<MascotMood, ReturnType<typeof performanceAt>[]>
