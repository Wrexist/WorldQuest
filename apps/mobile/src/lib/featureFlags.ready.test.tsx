import { beforeEach, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { __resetFeatureFlagsForTests, refreshFeatureFlags, useFeatureFlag } from './featureFlags.js'
const backend=vi.hoisted(()=>({ fetch:vi.fn() }))
vi.mock('./backend.js',()=>({ withAccount:()=>backend.fetch() }))
vi.mock('./supabase.js',()=>({ currentUser:async()=>({userId:'ready-user'}) }))
vi.mock('./connectivity.js',()=>({ onConnectivityChange:()=>()=>{} }))
beforeEach(()=>{__resetFeatureFlagsForTests();backend.fetch.mockReset()})
it('retries failed startup flags once the account is ready',async()=>{
  backend.fetch.mockRejectedValueOnce(new Error('Account changed during first sign-in'))
    .mockResolvedValue([{key:'weekly_league',enabled:true,rolloutPercent:100}])
  await refreshFeatureFlags()
  const hook=renderHook(()=>useFeatureFlag('weekly_league'))
  await waitFor(()=>expect(hook.result.current).toBe(true))
  expect(backend.fetch).toHaveBeenCalledTimes(2)
})
it('shares concurrent refresh requests from several mounted controls',async()=>{
  let resolve!: (value:unknown[])=>void
  backend.fetch.mockReturnValue(new Promise(r=>{resolve=r}))
  const first=refreshFeatureFlags(),second=refreshFeatureFlags()
  expect(first).toBe(second)
  resolve([])
  await first
  expect(backend.fetch).toHaveBeenCalledTimes(1)
})
