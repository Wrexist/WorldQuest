/**
 * Authored motion curves, in rig units. Geometry is sampled once, never on the JS frame loop.
 *
 * Three layers of acting, from the September 2026 emotion pass:
 *
 * - **FACE** — what a mood looks like at rest: which eyes and mouth, how far the lids are
 *   down, where the brows sit, how big the pupils are, which extras (tears, sparkles, Zzz)
 *   are showing. A still frame under Reduce Motion is exactly this, so every mood still
 *   reads with motion off.
 * - **performanceAt** — the entrance, played once when the mood appears: a surprise that
 *   jolts, a laugh that shakes, a wink. Every track starts and ends at rest, so a
 *   performance can never leave Atlas in an odd pose (mascotPerformance.test.ts).
 * - **idleAt** — the little life afterwards, looped slowly while he is on screen: a wink,
 *   a glance to each side, a hop, a nod-off-and-jolt when sleepy. Also rest at both ends,
 *   so the loop never pops.
 *
 * Kind by construction: nothing here laughs AT the learner. The funny is Atlas's own —
 * a smug wink after a streak, a snort of laughter at a perfect lesson, a sleepy globe
 * waiting for the signal to come back — and no emotion is used for a wrong answer.
 */
export type MascotMood =
  | 'welcome' | 'celebrate' | 'thinking' | 'resting' | 'encouraging'
  | 'laughing' | 'surprised' | 'proud' | 'sleepy' | 'wink'

export const MOODS: readonly MascotMood[] = ['welcome', 'celebrate', 'thinking', 'resting', 'encouraging', 'laughing', 'surprised', 'proud', 'sleepy', 'wink']

export const RIG = {
  size: 300, hips: { x: 140, y: 232 }, rightShoulder: { x: 226, y: 170 }, leftShoulder: { x: 62, y: 174 }, eyesY: 126,
  /** Where each eyelid hinges: the top of its eye, from the rig's eye ellipses. */
  lidLeft: { x: 123, y: 99 }, lidRight: { x: 171, y: 85 },
  /** Between the pupils, the point they grow and shrink about. */
  pupils: { x: 153, y: 130 },
} as const

export type Mouth = 'smile' | 'thinking' | 'gentle' | 'laugh' | 'surprised' | 'smirk'
export type Extra = 'tears' | 'sparkles' | 'zzz'
export type Face = {
  readonly eyes: 'open' | 'happy'
  readonly mouth: Mouth
  /** 0 open … 1 closed, left and right. */
  readonly lids: readonly [number, number]
  /** Rig units; negative raises the brows. */
  readonly browY: number
  /** 1 is the drawn size. */
  readonly pupil: number
  readonly extras: readonly Extra[]
}

const face = (f: Partial<Face>): Face => ({ eyes: 'open', mouth: 'smile', lids: [0, 0], browY: 0, pupil: 1, extras: [], ...f })

export const FACE: Record<MascotMood, Face> = {
  welcome: face({}),
  celebrate: face({ eyes: 'happy' }),
  thinking: face({ mouth: 'thinking', browY: -2 }),
  resting: face({ eyes: 'happy', mouth: 'gentle' }),
  encouraging: face({ mouth: 'gentle' }),
  laughing: face({ eyes: 'happy', mouth: 'laugh', extras: ['tears'] }),
  surprised: face({ mouth: 'surprised', browY: -7, pupil: .8 }),
  proud: face({ mouth: 'smirk', lids: [.42, .42], extras: ['sparkles'] }),
  sleepy: face({ mouth: 'gentle', lids: [.6, .6], browY: 2, extras: ['zzz'] }),
  wink: face({}),
}

const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }
const pulse = (t: number, start: number, end: number) => t <= start || t >= end ? 0 : Math.sin(Math.PI * (t - start) / (end - start)) ** 2
const envelope = (t: number, start: number, end: number) => smooth((t - start) / .12) * (1 - smooth((t - end + .18) / .18))
export const FRAME_TIMES = Array.from({ length: 121 }, (_, i) => i / 120)

const REST = { jump: 0, bodyY: 0, bodyTilt: 0, squash: 0, rightArm: 0, leftArm: 0, scarf: 0, gazeX: 0, gazeY: 0, browY: 0, lidL: 0, lidR: 0, pupil: 0, float: 0, twinkle: 0 }
export type Pose = typeof REST

export function performanceAt(mood: MascotMood, t: number): Pose {
  // Small, asymmetric gestures read as intentional acting, not a metronome.
  const greeting = envelope(t, .08, .87)
  const wave = Math.sin((t - .08) * Math.PI * 7) * greeting
  const anticipation = pulse(t, .04, .24)
  const airborne = pulse(t, .24, .66)
  const landing = pulse(t, .66, .87)
  switch (mood) {
    case 'welcome': return { ...REST, bodyTilt: -1.4 * pulse(t, .1, .92), rightArm: 9 * wave, leftArm: 1.5 * pulse(t, .16, .93), scarf: 1.4 * Math.sin(t * Math.PI * 5) * envelope(t, .2, .98), gazeX: 1.2 * pulse(t, .15, .85) }
    case 'celebrate': return { ...REST, jump: -10 * airborne, bodyY: 2.5 * anticipation + 1.8 * landing, bodyTilt: -2 * airborne, squash: -.025 * anticipation + .012 * airborne - .018 * landing,
      rightArm: -17 * pulse(t, .1, .84), leftArm: 12 * pulse(t, .16, .88), scarf: 3 * Math.sin(t * Math.PI * 4) * envelope(t, .23, .98) }
    case 'thinking': return { ...REST, bodyTilt: 3 * pulse(t, .06, .97), rightArm: 5 * pulse(t, .15, .95), gazeX: -3 * pulse(t, .08, .97), gazeY: -2 * pulse(t, .08, .97), browY: -2 * pulse(t, .2, .5) }
    case 'resting': return { ...REST }
    case 'encouraging': return { ...REST, bodyY: 1.2 * pulse(t, .18, .65), bodyTilt: -1.5 * pulse(t, .12, .8), rightArm: -6 * pulse(t, .14, .86) }
    case 'laughing': {
      // A belly laugh: a quick shake that builds and fades, arms pulled in, a snort-bounce.
      const laugh = envelope(t, .06, .92)
      return { ...REST, bodyTilt: 2.4 * Math.sin(t * Math.PI * 16) * laugh, bodyY: 1.6 * pulse(t, .1, .3) + 1.2 * pulse(t, .5, .7),
        squash: -.012 * pulse(t, .1, .3), rightArm: -10 * laugh, leftArm: 9 * laugh, float: 3 * pulse(t, .3, .95), scarf: 2 * Math.sin(t * Math.PI * 8) * laugh }
    }
    case 'surprised':
      // A jolt: everything goes up at once, then settles back slightly embarrassed.
      return { ...REST, bodyY: -3 * pulse(t, .06, .3), squash: .02 * pulse(t, .06, .26), bodyTilt: -3.5 * pulse(t, .06, .5),
        rightArm: -16 * pulse(t, .06, .6), leftArm: 13 * pulse(t, .06, .6), browY: -3 * pulse(t, .06, .4), pupil: -.12 * pulse(t, .06, .45), gazeY: -1.5 * pulse(t, .5, .9) }
    case 'proud':
      // Chin up, scarf in the wind, one slow deliberate wink.
      return { ...REST, bodyTilt: -3 * envelope(t, .05, .95), bodyY: -1 * envelope(t, .05, .95), lidR: .58 * pulse(t, .42, .62),
        scarf: 3.2 * Math.sin(t * Math.PI * 6) * envelope(t, .05, .98), rightArm: -5 * pulse(t, .1, .9), twinkle: .25 * Math.sin(t * Math.PI * 6) * envelope(t, .05, .95) }
    case 'sleepy':
      // Nods off, jolts awake a little, nods again.
      return { ...REST, bodyTilt: 4 * pulse(t, .15, .45) + 3 * pulse(t, .6, .95), bodyY: 1.5 * pulse(t, .15, .45) + 1.2 * pulse(t, .6, .95),
        lidL: .3 * pulse(t, .15, .45) + .3 * pulse(t, .6, .95), lidR: .3 * pulse(t, .15, .45) + .3 * pulse(t, .6, .95), browY: -3 * pulse(t, .44, .56), float: -6 * pulse(t, .05, .95) }
    case 'wink':
      return { ...REST, lidR: pulse(t, .3, .55), bodyTilt: -2 * pulse(t, .2, .7), rightArm: 6 * pulse(t, .2, .75), gazeX: 1.5 * pulse(t, .25, .65) }
  }
}

/** The loop after the entrance. Quiet: one small thing every few seconds, never two at once. */
export function idleAt(mood: MascotMood, t: number): Pose {
  const breathe = Math.sin(t * Math.PI * 2) ** 2
  switch (mood) {
    case 'sleepy':
      return { ...REST, bodyY: 1.2 * breathe, float: -8 * pulse(t, .0, 1), lidL: .15 * pulse(t, .55, .8), lidR: .15 * pulse(t, .55, .8), bodyTilt: 2 * pulse(t, .55, .8) }
    case 'resting':
      return { ...REST, bodyY: .8 * breathe }
    case 'thinking':
      return { ...REST, gazeX: -2.5 * pulse(t, .2, .45), gazeY: -2 * pulse(t, .2, .45), browY: -2 * pulse(t, .6, .75), bodyTilt: 1.5 * pulse(t, .6, .9) }
    case 'laughing':
    case 'celebrate':
      return { ...REST, bodyTilt: 1.2 * Math.sin(t * Math.PI * 12) * pulse(t, .3, .5), bodyY: -2 * pulse(t, .75, .85), float: 2 * pulse(t, .3, .6) }
    case 'proud':
      return { ...REST, twinkle: .25 * pulse(t, .1, .3) + .25 * pulse(t, .6, .8), scarf: 2 * Math.sin(t * Math.PI * 6) * pulse(t, .4, .7), lidR: .58 * pulse(t, .82, .9) }
    case 'surprised':
      return { ...REST, gazeX: -2 * pulse(t, .2, .35) + 2 * pulse(t, .4, .55), browY: -2 * pulse(t, .7, .8) }
    default:
      // welcome, encouraging, wink: a wink, a look left and right, a tiny hop.
      return { ...REST, lidR: pulse(t, .22, .28), gazeX: -2.5 * pulse(t, .45, .58) + 2.5 * pulse(t, .6, .73),
        bodyY: -2.5 * pulse(t, .86, .93), squash: -.012 * pulse(t, .84, .88) + .01 * pulse(t, .88, .93) }
  }
}

/** A boop: the laugh, whatever the mood, played on its own clock over the top. */
export const boopAt = (t: number): Pose => performanceAt('laughing', t)

const sample = (fn: (t: number) => Pose) => FRAME_TIMES.map(fn)
export const PERFORMANCES = Object.fromEntries(MOODS.map(mood => [mood, sample(t => performanceAt(mood, t))])) as Record<MascotMood, Pose[]>
export const IDLES = Object.fromEntries(MOODS.map(mood => [mood, sample(t => idleAt(mood, t))])) as Record<MascotMood, Pose[]>
export const BOOP = sample(boopAt)
