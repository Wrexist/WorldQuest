/** Wire presentation only. Correct answers and account identifiers never cross this boundary. */
export type ChallengeQuestion = {
  promptKey: string; promptParams: Readonly<Record<string,string>>;
  options: readonly { id:string; label:string }[];
}
export type FriendChallenge = {
  id:string; locale:'en'|'sv'; expiresAt:number; isCreator:boolean;
  peer:string|null; state:'ready'|'waiting'|'complete'|'expired'; submitted:boolean;
  result:null|{ yours:number|null; theirs:number|null; outcome:'won'|'lost'|'draw'|'unplayed' };
}
export type ChallengeAction =
  | { action:'create'; inviteCode:string; locale:'en'|'sv' }
  | { action:'join'; inviteCode:string }
  | { action:'start'|'hide'|'block'|'cancel'; id:string }
  | { action:'submit'; id:string; answers:readonly string[] }
  | { action:'report'; id:string; reason:'unwanted'|'cheating'|'other' }
export type ChallengeResponse = {
  challenges:readonly FriendChallenge[];
  active?:FriendChallenge;
  questions?:readonly ChallengeQuestion[];
}
