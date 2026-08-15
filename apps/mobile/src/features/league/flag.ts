/**
 * The league is behind a flag, closed by default.
 *
 * The engine and the RLS are proven — CI runs 35 tests against the schema — and this is
 * still the app's only surface where one user sees anything about another. A staged
 * rollout is how you find out whether the placement job, the weekly rollover and the
 * cohort sizes behave with real people in them, and the cost of finding out the other
 * way is a leaderboard behaving oddly for everybody at once.
 *
 * Closed by default is the module's own default (`lib/featureFlags.ts`): an absent row
 * is off, so the flag has to be deliberately opened rather than deliberately closed.
 */

import { useFeatureFlag } from '../../lib/featureFlags.js'

export const LEAGUE_FLAG = 'weekly_league'

export const useLeagueEnabled = (): boolean => useFeatureFlag(LEAGUE_FLAG)
