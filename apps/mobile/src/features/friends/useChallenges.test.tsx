import { beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useChallenges } from './useChallenges.js'

const api=vi.hoisted(()=>({list:vi.fn(),act:vi.fn(),inviteCode:vi.fn(),enabled:true}))
vi.mock('../../lib/backend.js',()=>({withAccount:(work:(account:unknown)=>unknown)=>work({challenges:api})}))
vi.mock('../../lib/featureFlags.js',()=>({useFeatureFlag:()=>api.enabled}))
const cache=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})
vi.mock('../../lib/query.js',()=>({queryClient:()=>cache}))
const storage=vi.hoisted(()=>new Map<string,unknown>())
vi.mock('../../lib/storage.js',()=>({readJson:(key:string)=>storage.get(key)??null,writeJson:(key:string,value:unknown)=>storage.set(key,value),remove:(key:string)=>storage.delete(key)}))
const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={cache}>{children}</QueryClientProvider>
const active={id:'round',locale:'en',expiresAt:100,isCreator:true,canCancel:true,peer:null,state:'ready',submitted:false,result:null}
const questions=Array.from({length:10},(_,i)=>({promptKey:'question',promptParams:{},options:[{id:`answer-${i}`,label:'Choice'}]}))
beforeEach(()=>{cache.clear();storage.clear();api.enabled=true;api.list.mockReset().mockResolvedValue({challenges:[]});api.act.mockReset();api.inviteCode.mockReset().mockReturnValue('a'.repeat(24))})

it('deduplicates rapid create taps and reuses the invitation secret after failure',async()=>{
  api.act.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({challenges:[]})
  const {result}=renderHook(useChallenges,{wrapper})
  await act(async()=>{await Promise.all([result.current.create(),result.current.create()])})
  expect(api.act).toHaveBeenCalledTimes(1)
  expect(result.current.error).toBe(true)
  expect(result.current.invite).toBe('')
  await act(async()=>{await result.current.create()})
  expect(api.inviteCode).toHaveBeenCalledTimes(1)
  expect(result.current.invite).toBe('a'.repeat(24))
})
it('keeps answers after failed submission and removes them only after confirmation',async()=>{
  api.act.mockResolvedValueOnce({challenges:[],active,questions})
  const {result}=renderHook(useChallenges,{wrapper})
  await act(async()=>{await result.current.act({action:'start',id:'round'})})
  for(let i=0;i<10;i++)act(()=>result.current.answer(`answer-${i}`))
  api.act.mockRejectedValueOnce(new Error('offline'))
  await act(async()=>{result.current.submit()})
  await waitFor(()=>expect(result.current.busy).toBe(false))
  expect(result.current.answers).toHaveLength(10)
  expect(storage.get('challenge.answers.round')).toHaveLength(10)
  api.act.mockResolvedValue({challenges:[]})
  await act(async()=>{result.current.submit()})
  await waitFor(()=>expect(result.current.round).toBeNull())
  expect(storage.has('challenge.answers.round')).toBe(false)
})
it('restores valid drafts, rejects obsolete option IDs, and keeps questions out of persisted query data',async()=>{
  storage.set('challenge.answers.round',['answer-0'])
  api.act.mockResolvedValue({challenges:[],active,questions})
  const {result}=renderHook(useChallenges,{wrapper})
  await act(async()=>{await result.current.act({action:'start',id:'round'})})
  expect(result.current.answers).toEqual(['answer-0'])
  expect(cache.getQueryData(['friend-challenges'])).toEqual({challenges:[]})
  storage.set('challenge.answers.round',['obsolete'])
  await act(async()=>{await result.current.act({action:'start',id:'round'})})
  expect(result.current.answers).toEqual([])
})
it('does not fetch or create while the feature is unavailable',async()=>{
  api.enabled=false
  const {result}=renderHook(useChallenges,{wrapper})
  await act(async()=>{await result.current.create()})
  expect(api.list).not.toHaveBeenCalled()
  expect(api.act).not.toHaveBeenCalled()
})
