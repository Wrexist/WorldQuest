import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { BALANCE, type ShopItem } from '@worldquest/engines'
import { setOwned, useShop } from './useShop.js'
const backend = vi.hoisted(() => ({ purchase: vi.fn(), configured: true }))
vi.mock('../../lib/supabase.js', () => ({ isConfigured: () => backend.configured }))
vi.mock('../../lib/backend.js', () => ({ withAccount: (work: (api: unknown) => unknown) => work({ purchaseItem: backend.purchase }) }))
vi.mock('../../lib/query.js', () => ({ invalidateProgress: vi.fn() }))
vi.mock('../../lib/analytics.js', () => ({ track: vi.fn() }))
const item: ShopItem = { id: 'title.map-nerd', kind: 'title', nameKey: 'shop:title.mapNerd', price: BALANCE.prices.titleUnlock }
beforeEach(() => { backend.configured = true; backend.purchase.mockReset(); setOwned([]) })
describe('Confirmed shop ownership', () => {
  it.each(['insufficient_funds', 'not_for_sale'])('does not grant or equip a declined %s purchase', async status => {
    backend.purchase.mockResolvedValue({ status })
    const { result } = renderHook(useShop)
    await act(() => result.current.buy(item, 0))
    expect(result.current.owned.has(item.id)).toBe(false)
    expect(result.current.purchaseError).toBe(true)
    act(() => result.current.equip(item.id))
    expect(result.current.equippedId).toBeNull()
  })
  it('keeps ownership unchanged after a network error or missing backend', async () => {
    backend.purchase.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(useShop)
    await act(() => result.current.buy(item, 0))
    expect(result.current.owned.size).toBe(0)
    backend.configured = false
    await act(() => result.current.buy(item, 0))
    expect(result.current.owned.size).toBe(0)
    expect(backend.purchase).toHaveBeenCalledTimes(1)
  })
  it('confirms once before ownership and keeps the equipped item across remounts', async () => {
    let resolve!: (value: { status: string }) => void
    backend.purchase.mockReturnValue(new Promise(r => { resolve = r }))
    const hook = renderHook(useShop)
    let first!: Promise<void>
    act(() => { first = hook.result.current.buy(item, 0); void hook.result.current.buy(item, 0) })
    expect(backend.purchase).toHaveBeenCalledTimes(1)
    expect(hook.result.current.owned.size).toBe(0)
    expect(hook.result.current.pendingId).toBe(item.id)
    await act(async () => { resolve({ status: 'purchased' }); await first })
    act(() => hook.result.current.equip(item.id))
    hook.unmount()
    const restored = renderHook(useShop)
    expect(restored.result.current.owned.has(item.id)).toBe(true)
    expect(restored.result.current.equippedId).toBe(item.id)
    act(() => setOwned([]))
    expect(restored.result.current.equippedId).toBeNull()
  })
})
