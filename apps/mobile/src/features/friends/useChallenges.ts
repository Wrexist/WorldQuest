import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ChallengeAction, ChallengeQuestion, ChallengeResponse, FriendChallenge } from '@worldquest/engines'
import { withAccount } from '../../lib/backend.js'
import { useFeatureFlag } from '../../lib/featureFlags.js'
import { currentLocale } from '../../lib/i18n.js'
import { queryClient } from '../../lib/query.js'
import { readJson, writeJson, remove } from '../../lib/storage.js'

const key=['friend-challenges'] as const
const draftKey=(id:string)=>`challenge.answers.${id}`
export function useChallenges() {
  const enabled=useFeatureFlag('friend_challenges')
  const [busy,setBusy]=useState(false),[error,setError]=useState(false)
  const [invite,setInvite]=useState(''),[notice,setNotice]=useState<'reported'|'blocked'|null>(null)
  const [round,setRound]=useState<{active:FriendChallenge;questions:readonly ChallengeQuestion[]}|null>(null)
  const [answers,setAnswers]=useState<string[]>([])
  const locked=useRef(false),pendingCode=useRef<string|null>(null)
  const creating=useRef(false)
  const query=useQuery({queryKey:key,enabled,staleTime:15000,refetchOnWindowFocus:true,
    queryFn:()=>withAccount(account=>{
      if(!account.challenges)throw new Error('Unavailable')
      return account.challenges.list()
    })})
  async function act(action:ChallengeAction) {
    if(locked.current||!enabled)return
    locked.current=true;setBusy(true);setError(false);setNotice(null)
    try {
      const value=await withAccount(account=>{
        if(!account.challenges)throw new Error('Unavailable')
        return account.challenges.act(action)
      })
      queryClient().setQueryData<ChallengeResponse>(key,{challenges:value.challenges})
      if(action.action==='create'){setInvite(action.inviteCode);pendingCode.current=null}
      if(action.action==='start'&&value.questions&&value.active){
        const saved=readJson<string[]>(draftKey(value.active.id),v=>Array.isArray(v)&&v.length<=10&&v.every(a=>typeof a==='string'))??[]
        setAnswers(saved.every((a,i)=>value.questions![i]?.options.some(o=>o.id===a))?saved:[])
        setRound({active:value.active,questions:value.questions})
      }
      if(action.action==='submit'){setRound(null);setAnswers([]);remove(draftKey(action.id))}
      if(action.action==='report')setNotice('reported')
      if(action.action==='block')setNotice('blocked')
      if(action.action==='cancel')setInvite('')
    }catch{setError(true)}finally{locked.current=false;setBusy(false)}
  }
  async function create() {
    if(creating.current||locked.current||!enabled)return
    creating.current=true
    try {
      if(!pendingCode.current)pendingCode.current=await withAccount(async account=>{
        if(!account.challenges)throw new Error('Unavailable')
        return account.challenges.inviteCode()
      })
      await act({action:'create',inviteCode:pendingCode.current,locale:currentLocale()==='sv'?'sv':'en'})
    }catch{setError(true)}finally{creating.current=false}
  }
  function answer(id:string) {
    if(!round||answers.length>=10||!round.questions[answers.length]?.options.some(o=>o.id===id))return
    const next=[...answers,id];setAnswers(next);writeJson(draftKey(round.active.id),next)
  }
  return { enabled,busy,error,notice,invite,round,answers,answer,act,create,
    challenges:enabled?query.data?.challenges??[]:[],
    loading:enabled&&query.isPending,loadError:query.isError,refresh:()=>{setError(false);void query.refetch()},
    leaveRound:()=>setRound(null),submit:()=>{if(round)void act({action:'submit',id:round.active.id,answers})} }
}
