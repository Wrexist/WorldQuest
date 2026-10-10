/**
 * The map drill's scene: "Find Austria on the map", answered by tapping it. Pure.
 *
 * The opposite disclosure from `identify-country`. There the shape is shown and the name
 * hidden; here the name is the question, so it is the MAP that must say nothing: no label,
 * no pin, no outline of the country asked for, and an accessible summary that names the
 * region and not the answer. Nothing is tinted until something is picked: a first cut tinted
 * every country in play, and the pick — the same sun colour — vanished into it (2026-10-10).
 * A pick lights alone, and the rest of the land softens around it.
 *
 * Once graded the map teaches, which is what the research behind this mode says matters
 * most (docs/design/map-drill.md §3): the right country lit and named, the tapped one beside
 * it and named too, and the camera easing in on the pair so the gap between them is the
 * picture the learner leaves with.
 */

import { ATLAS_COUNTRIES, ATLAS_REGION_FRAMES } from '../data/atlas.generated.js'
import type { AtlasFrame, LatLon } from '../geo/types.js'
import type { AtlasHighlight, AtlasLabel, AtlasSceneSpec } from './types.js'

type Translate = (key: string, params?: Record<string, string | number>) => string

export type LocateSceneInput = {
  readonly sceneKey: string
  /** The country asked for. */
  readonly entityId: string
  /** Every country the map may accept: the question's options. */
  readonly optionIds: readonly string[]
  /** `revealed` once the question is over: found, or out of tries. */
  readonly phase: 'question' | 'selected' | 'submitting' | 'revealed'
  /** The country picked but not yet checked. Drawn, never named. */
  readonly selectedId: string | null
  /**
   * Countries tapped and checked that were not the answer, first (the graded one) first.
   * Each stays on the map, lit and named, and cannot be picked again: a wrong tap still
   * teaches one country (map-drill research §2).
   */
  readonly misses: readonly string[]
  readonly countryName: (countryId: string) => string | undefined
  readonly regionName: (regionId: string) => string | undefined
  readonly t: Translate
}

/** The scene, or null when the atlas has no geometry for the country asked about. */
export function buildLocateScene(input: LocateSceneInput): AtlasSceneSpec | null {
  const country = ATLAS_COUNTRIES[input.entityId]
  if (country === undefined) return null
  const regionFrame = ATLAS_REGION_FRAMES[country.region]
  const revealed = input.phase === 'revealed'
  const field = input.optionIds.filter((id) => ATLAS_COUNTRIES[id] !== undefined)
  const misses = input.misses.filter((id) => id !== input.entityId && ATLAS_COUNTRIES[id] !== undefined)
  const region = input.regionName(country.region) ?? ''

  const ringed = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const c = ATLAS_COUNTRIES[id]
      return c?.small ? [{ countryId: id, lat: c.anchor[0], lon: c.anchor[1] }] : []
    })
  const missLabels = misses.map((id) => labelOf(id, input.countryName(id) ?? '', 5))

  if (!revealed) {
    const open = field.filter((id) => !misses.includes(id))
    const selected = input.selectedId !== null && open.includes(input.selectedId) ? input.selectedId : null
    const highlights: AtlasHighlight[] = [
      ...misses.map((id): AtlasHighlight => ({ countryId: id, state: 'incorrect' })),
      ...(selected === null ? [] : [{ countryId: selected, state: 'selected' } as const]),
    ]
    const last = misses.at(-1)
    return {
      sceneKey: input.sceneKey,
      mode: 'locate-country',
      phase: input.phase,
      focus: regionFrame !== undefined
        ? { kind: 'region', regionId: country.region, frame: regionFrame }
        : { kind: 'world' },
      highlights,
      markers: [],
      labels: missLabels,
      interaction: { rotate: true, zoom: true, selectable: open },
      summary: last === undefined
        ? input.t('atlas:summary.locate', { region })
        : input.t('atlas:summary.locateRetry', { region, chosen: input.countryName(last) ?? '' }),
      // Every microstate in play, not just the answer: a ring around the answer alone
      // would be the answer.
      rings: ringed(field),
    }
  }

  const name = input.countryName(input.entityId) ?? ''
  const last = misses.at(-1) ?? null
  const highlights: AtlasHighlight[] = [
    { countryId: input.entityId, state: 'correct' },
    ...misses.map((id): AtlasHighlight => ({ countryId: id, state: 'incorrect' })),
  ]
  const labels: AtlasLabel[] = [labelOf(input.entityId, name, 10), ...missLabels]
  return {
    sceneKey: input.sceneKey,
    mode: 'locate-country',
    phase: input.phase,
    focus: { kind: 'country', countryId: input.entityId, frame: revealFrame(input.entityId, last) },
    highlights,
    markers: [],
    labels,
    interaction: { rotate: true, zoom: true, selectable: [] },
    summary: last === null
      ? input.t('atlas:summary.identifyRevealed', { country: name })
      : input.t('atlas:summary.identifyWrong', { country: name, chosen: input.countryName(last) ?? '' }),
    rings: ringed([input.entityId, ...misses]),
  }
}

function labelOf(id: string, text: string, priority: number): AtlasLabel {
  const c = ATLAS_COUNTRIES[id]!
  return { countryId: id, lat: c.anchor[0], lon: c.anchor[1], text, priority, extent: c.frame.radius }
}

/**
 * A view of the answer close enough to see it and wide enough to see where it is: its own
 * neighbourhood, or both countries when the tap was elsewhere. Never closer than a few
 * neighbours' worth — a microstate edge to edge is a blob, not a place.
 */
export function revealFrame(answerId: string, chosenId: string | null): AtlasFrame {
  const answer = ATLAS_COUNTRIES[answerId]!.frame
  const chosen = chosenId === null ? undefined : ATLAS_COUNTRIES[chosenId]?.frame
  if (chosen === undefined) return { ...answer, radius: clampRadius(answer.radius * 2.2) }
  const gap = angleBetween(answer, chosen)
  const middle = midpoint(answer, chosen)
  return { ...middle, radius: clampRadius(gap / 2 + Math.max(answer.radius, chosen.radius) * 1.3) }
}

const clampRadius = (radius: number): number => Math.min(45, Math.max(REVEAL_MIN_RADIUS, radius))
/** Degrees: about a small country and its neighbours at a phone's width. */
const REVEAL_MIN_RADIUS = 7

export type Compass = 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest'
const COMPASS: readonly Compass[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']

/**
 * Which way the answer lies from the country tapped, as one of eight words — "Austria is
 * west of Hungary". The initial great-circle bearing between the two anchors: an anchor is
 * inside its country by construction, so the direction is between two real places, not two
 * bounding boxes. Null when either is unknown or they are the same place.
 */
export function compassFrom(fromId: string, toId: string): Compass | null {
  const from = ATLAS_COUNTRIES[fromId]
  const to = ATLAS_COUNTRIES[toId]
  if (from === undefined || to === undefined || fromId === toId) return null
  const bearing = initialBearing({ lat: from.anchor[0], lon: from.anchor[1] }, { lat: to.anchor[0], lon: to.anchor[1] })
  return COMPASS[Math.round(bearing / 45) % 8]!
}

const RAD = Math.PI / 180

/** Degrees clockwise from north, 0–360. */
export function initialBearing(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * RAD
  const lat2 = b.lat * RAD
  const dLon = (b.lon - a.lon) * RAD
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

function angleBetween(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * RAD
  const lat2 = b.lat * RAD
  const cos = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos((b.lon - a.lon) * RAD)
  return Math.acos(Math.min(1, Math.max(-1, cos))) / RAD
}

function midpoint(a: LatLon, b: LatLon): LatLon {
  const lat1 = a.lat * RAD
  const lat2 = b.lat * RAD
  const dLon = (b.lon - a.lon) * RAD
  const bx = Math.cos(lat2) * Math.cos(dLon)
  const by = Math.cos(lat2) * Math.sin(dLon)
  const lat = Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.sqrt((Math.cos(lat1) + bx) ** 2 + by ** 2))
  const lon = a.lon * RAD + Math.atan2(by, Math.cos(lat1) + bx)
  return { lat: lat / RAD, lon: ((lon / RAD + 540) % 360) - 180 }
}
