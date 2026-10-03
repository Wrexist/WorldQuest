import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { entityProgress } from '@worldquest/engines'

const load = vi.hoisted(() => vi.fn())
vi.mock('./bundledText.js', () => ({ bundledText: load }))
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ code: 'SE' }),
  router: { canGoBack: () => true, back: vi.fn(), replace: vi.fn(), push: vi.fn() } }))
import { useReferenceContent } from './referenceContent.js'
import CountryRoute from '../../app/country/[code].js'
import { setLocale } from './i18n.js'

it('shows loading/error, retries the local asset, and exposes the full country details offline', async () => {
  load.mockRejectedValueOnce(new Error('temporary local read failure'))
    .mockResolvedValueOnce(readFileSync(join(import.meta.dirname, '../../assets/content/reference-catalogue.bin'), 'utf8'))
  const { result, rerender } = renderHook(() => useReferenceContent())
  expect(result.current.status).toBe('loading')
  expect(result.current.index).toBeNull()
  await waitFor(() => expect(result.current.status).toBe('error'))
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  const index = result.current.index!.index
  expect(entityProgress(index, 'SE', new Map(), 0).factsTotal).toBe(130)
  const deep = [...index.facts.values()].find(fact => fact.entity === 'SE' && fact.attribute === 'athlete')!
  expect(deep.value.names?.sv).toBeTruthy()
  expect(deep.source?.url).toBeTruthy()
  expect(index.items).toHaveLength(0)
  const loaded = result.current.index
  rerender()
  expect(result.current.index).toBe(loaded)
})

it('renders the full Swedish country reference, including facts that previously existed only in lessons', async () => {
  setLocale('en')
  render(<CountryRoute />)
  await waitFor(() => expect(screen.getByRole('progressbar', { name: '0 of 130 learned' })).toBeTruthy())
  expect(screen.getByText('Stockholm')).toBeTruthy()
  expect(screen.getAllByText('Athlete').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Company').length).toBeGreaterThan(0)
  expect(screen.getByText('Kebnekaise')).toBeTruthy()
  await act(async () => { await setLocale('sv') })
  expect(screen.getByRole('heading', { name: 'Sverige' })).toBeTruthy()
  expect(screen.getByText('Europa')).toBeTruthy()
  expect(screen.getAllByText('Idrottare').length).toBeGreaterThan(0)
  await act(async () => { await setLocale('en') })
})
