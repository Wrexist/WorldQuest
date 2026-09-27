import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FriendChallenge } from '@worldquest/engines'
import { FriendsScreen } from './FriendsScreen.js'

const state=vi.hoisted(()=>({online:true,model:{
  enabled:true,busy:false,error:false,loadError:false,loading:false,notice:null as 'reported'|'blocked'|null,
  invite:'',round:null as null|{active:FriendChallenge;questions:{promptKey:string;promptParams:Record<string,string>;options:{id:string;label:string}[]}[]},
  answers:[] as string[],challenges:[] as FriendChallenge[],
  act:vi.fn(),create:vi.fn(),refresh:vi.fn(),answer:vi.fn(),leaveRound:vi.fn(),submit:vi.fn(),
}}))
vi.mock('./useChallenges.js',()=>({useChallenges:()=>state.model}))
vi.mock('../../lib/connectivity.js',()=>({useOnline:()=>state.online}))
const challenge:FriendChallenge={id:'round',locale:'en',expiresAt:Date.UTC(2026,9,1),isCreator:false,canCancel:false,peer:'Swift Glacier 42',state:'ready',submitted:false,result:null}
beforeEach(()=>{
  state.online=true
  Object.assign(state.model,{enabled:true,busy:false,error:false,loadError:false,loading:false,notice:null,invite:'',round:null,answers:[],challenges:[]})
  vi.clearAllMocks()
})
it('blocks network actions offline while explaining how to resume',()=>{
  state.online=false;state.model.challenges=[challenge]
  render(<FriendsScreen onBack={vi.fn()}/>)
  expect(screen.getByText(/You're offline/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Create invitation'}))
  fireEvent.click(screen.getByRole('button',{name:'Open challenge'}))
  expect(state.model.create).not.toHaveBeenCalled()
  expect(state.model.act).not.toHaveBeenCalled()
})
it('shows an ended round without inventing a score for an absent player',()=>{
  state.model.challenges=[{...challenge,state:'expired',result:{yours:8,theirs:null,outcome:'unplayed'}}]
  render(<FriendsScreen onBack={vi.fn()}/>)
  expect(screen.getByText('This round has ended')).toBeTruthy()
  expect(screen.queryByText(/Friend: 0\/10/)).toBeNull()
  expect(screen.queryByRole('button',{name:'Open challenge'})).toBeNull()
})
it('keeps answers uncommitted until Lock answer and exposes the selected option',()=>{
  state.model.round={active:challenge,questions:[{promptKey:'lesson:prompt.capital_of',promptParams:{entityName:'Italy'},options:[{id:'rome',label:'Rome'},{id:'oslo',label:'Oslo'}]}]}
  render(<FriendsScreen onBack={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'Lock answer'}))
  expect(state.model.answer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Rome'}))
  expect(state.model.answer).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'Rome'}).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('button',{name:'Lock answer'}))
  expect(state.model.answer).toHaveBeenCalledWith('rome')
})
it('provides fixed report reasons and sends the challenge-scoped block action',()=>{
  state.model.challenges=[challenge]
  render(<FriendsScreen onBack={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'Report explorer'}))
  fireEvent.click(screen.getByRole('button',{name:'Unwanted invitations'}))
  expect(state.model.act).toHaveBeenCalledWith({action:'report',id:'round',reason:'unwanted'})
  fireEvent.click(screen.getByRole('button',{name:'Block explorer'}))
  expect(state.model.act).toHaveBeenCalledWith({action:'block',id:'round'})
})
it('shows release eligibility instead of invite controls when unavailable',()=>{
  state.model.enabled=false
  render(<FriendsScreen onBack={vi.fn()}/>)
  expect(screen.getByText('Challenges are not available yet')).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Create invitation'})).toBeNull()
})

it('offers cancellation only when the server says the invitation is unused',()=>{
 state.model.challenges=[{...challenge,isCreator:true,canCancel:true,peer:null}]
 const view=render(<FriendsScreen onBack={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'Cancel invitation'}))
 expect(state.model.act).toHaveBeenCalledWith({action:'cancel',id:'round'})
 state.model.challenges=[{...challenge,isCreator:true,canCancel:false}]
 view.rerender(<FriendsScreen onBack={vi.fn()}/>)
 expect(screen.queryByRole('button',{name:'Cancel invitation'})).toBeNull()
})
