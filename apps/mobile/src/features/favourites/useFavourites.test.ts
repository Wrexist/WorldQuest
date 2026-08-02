import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { resetFavouritesCache, useFavourites } from './useFavourites.js'
import { readJson, remove, writeJson } from '../../lib/storage.js'

const KEY = 'favourites.countries.v1'

beforeEach(() => {
  remove(KEY)
  resetFavouritesCache()
})

describe('useFavourites', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useFavourites())
    expect(result.current.favourites.size).toBe(0)
    expect(result.current.isFavourite('SE')).toBe(false)
  })

  it('toggles on and back off', () => {
    const { result } = renderHook(() => useFavourites())

    act(() => {
      expect(result.current.toggle('SE')).toBe(true)
    })
    expect(result.current.isFavourite('SE')).toBe(true)

    act(() => {
      expect(result.current.toggle('SE')).toBe(false)
    })
    expect(result.current.isFavourite('SE')).toBe(false)
  })

  it('reaches every subscriber, not just the one that wrote', () => {
    // The bug this exists to prevent: star a country on `/country/SE`, go back to
    // the collection, and the grid still shows it unstarred because each screen
    // held its own useState.
    const a = renderHook(() => useFavourites())
    const b = renderHook(() => useFavourites())

    act(() => {
      a.result.current.toggle('SE')
    })

    expect(b.result.current.isFavourite('SE')).toBe(true)
  })

  it('survives a restart', () => {
    const first = renderHook(() => useFavourites())
    act(() => {
      first.result.current.toggle('JP')
    })

    // Cold start: the module cache is gone, storage is not.
    resetFavouritesCache()
    const second = renderHook(() => useFavourites())
    expect(second.result.current.isFavourite('JP')).toBe(true)
  })

  it('writes a sorted list, so two devices that starred the same set agree', () => {
    const { result } = renderHook(() => useFavourites())
    act(() => {
      result.current.toggle('SE')
      result.current.toggle('AR')
      result.current.toggle('JP')
    })
    expect(readJson<string[]>(KEY)).toEqual(['AR', 'JP', 'SE'])
  })

  it('ignores junk in storage rather than rendering it', () => {
    // A non-string id cannot name a country, and one that slipped through would be a
    // blank tile forever with no way for a user to remove it.
    writeJson(KEY, ['SE', 42, null, { code: 'NO' }, 'JP'])
    resetFavouritesCache()

    const { result } = renderHook(() => useFavourites())
    expect([...result.current.favourites].sort()).toEqual(['JP', 'SE'])
  })

  it('treats a corrupt value as no favourites, not as a crash', () => {
    writeJson(KEY, { SE: true })
    resetFavouritesCache()

    const { result } = renderHook(() => useFavourites())
    expect(result.current.favourites.size).toBe(0)
  })
})
