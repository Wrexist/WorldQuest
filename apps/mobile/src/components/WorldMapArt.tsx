import { ClayMap } from './ClayMap.js'

/** Decorative still from the same sourced relief globe used in learning. */
export function WorldMapArt({ width, height, region = 'world' }: { width: number; height: number; region?: string }) {
  return <ClayMap name={region === 'world' ? 'world' : `region-${region}`} style={{ width, height }} />
}
