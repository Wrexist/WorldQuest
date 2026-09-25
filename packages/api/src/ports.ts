import type {
  ContinuePurchase, FreezePurchase, LeagueCohort, Progress, QuestRow, StreakRepair,
  SubmitLessonRequest, SubmitLessonResponse, SubscriptionRow,
} from './contracts.js'

export type AccountIdentity = {
  readonly backendId: string
  readonly userId: string
}

/** A handle is bound to one account. Adapters must never borrow a later user's token. */
export type AccountRepository = {
  readonly identity: AccountIdentity
  readonly submitLesson: (request: SubmitLessonRequest) => Promise<SubmitLessonResponse>
  readonly fetchProgress: () => Promise<Progress>
  readonly fetchSubscription: () => Promise<SubscriptionRow>
  readonly buyStreakFreeze: () => Promise<FreezePurchase>
  readonly repairStreak: () => Promise<StreakRepair>
  readonly buyLessonContinue: (continueId: string) => Promise<ContinuePurchase>
  readonly fetchLeague: () => Promise<LeagueCohort | null>
  readonly fetchLeagueOptOut: () => Promise<boolean>
  readonly setLeagueOptOut: (optedOut: boolean) => Promise<void>
  readonly fetchInventory: () => Promise<readonly string[]>
  readonly purchaseItem: (itemId: string) => Promise<{ status: string }>
  readonly fetchTimeZone: () => Promise<string>
  readonly setTimeZone: (zone: string) => Promise<void>
  readonly fetchFeatureFlags: () => Promise<readonly { key: string; enabled: boolean; rolloutPercent: number }[]>
  /**
   * Today's quest as the server composed it, with the progress it pays on. Only a backend
   * that composes quests itself has one (the Worker); the legacy one pins the device's.
   */
  readonly fetchTodayQuest?: () => Promise<{ day: string; quest: QuestRow }>
}

export type AuthRepository = {
  readonly currentUser: () => Promise<{ userId: string }>
  readonly accountEmail: () => Promise<string | null>
  readonly linkEmail: (email: string) => Promise<void>
  readonly confirmEmail: (email: string, code: string) => Promise<void>
  readonly requestSignIn: (email: string) => Promise<void>
  readonly confirmSignIn: (email: string, code: string) => Promise<{ userId: string }>
  readonly signOut: () => Promise<void>
}

export type Backend = {
  readonly auth: AuthRepository
  readonly forAccount: (userId: string) => Promise<AccountRepository>
}

export class AccountChangedError extends Error {
  constructor() {
    super('Account changed while preparing a request')
    this.name = 'AccountChangedError'
  }
}
