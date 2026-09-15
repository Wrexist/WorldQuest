import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types.js'
import type { Backend, AccountRepository } from './ports.js'
import { AccountChangedError } from './ports.js'
import * as api from './client.js'

/** The source adapter remains usable while the candidate is proved separately. */
export function createSupabaseBackend(
  config: api.WorldQuestConfig,
  sessionClient = api.createWorldQuestClient(config),
): Backend {
  return {
    auth: {
      currentUser: () => api.ensureSession(sessionClient),
      accountEmail: () => api.accountEmail(sessionClient),
      linkEmail: (email) => api.linkEmail(sessionClient, email),
      confirmEmail: (email, code) => api.confirmEmail(sessionClient, email, code),
      requestSignIn: (email) => api.requestSignIn(sessionClient, email),
      confirmSignIn: (email, code) => api.confirmSignIn(sessionClient, email, code),
      signOut: () => api.signOut(sessionClient),
    },
    async forAccount(userId): Promise<AccountRepository> {
      const { data, error } = await sessionClient.auth.getSession()
      if (error) throw error
      if (!data.session || data.session.user.id !== userId) throw new AccountChangedError()
      const token = data.session.access_token
      // An immutable token callback prevents a delayed A request from acquiring B's
      // credentials inside the SDK. Expiry fails and the caller opens a fresh handle.
      const client = createClient<Database>(config.url, config.publishableKey, {
        accessToken: async () => token,
      })
      return {
        identity: { backendId: config.url, userId },
        submitLesson: (request) => api.submitLesson(client, request),
        fetchProgress: () => api.fetchProgress(client),
        fetchSubscription: () => api.fetchSubscription(client),
        buyStreakFreeze: () => api.buyStreakFreeze(client),
        repairStreak: () => api.repairStreak(client),
        buyLessonContinue: (id) => api.buyLessonContinue(client, id),
        fetchLeague: () => api.fetchLeague(client),
        fetchLeagueOptOut: () => api.fetchLeagueOptOut(client),
        setLeagueOptOut: (value) => api.setLeagueOptOut(client, userId, value),
        async fetchInventory() {
          const { data, error } = await client.from('inventory').select('item_id')
          if (error) throw error
          return (data ?? []).map((row) => row.item_id)
        },
        async purchaseItem(itemId) {
          const { data, error } = await client.rpc('purchase_item', { p_item_id: itemId })
          if (error) throw error
          if (typeof data !== 'object' || data === null || Array.isArray(data) || typeof data.status !== 'string') {
            throw new Error('Invalid purchase response')
          }
          return { status: data.status }
        },
        async fetchTimeZone() {
          const { data, error } = await client.from('profiles').select('timezone').eq('id', userId).single()
          if (error) throw error
          return data.timezone
        },
        async setTimeZone(zone) {
          const { error } = await client.from('profiles').update({ timezone: zone }).eq('id', userId)
          if (error) throw error
        },
        async fetchFeatureFlags() {
          const { data, error } = await client.from('feature_flags').select('key, enabled, rollout_percent')
          if (error) throw error
          return (data ?? []).map((row) => ({ key: row.key, enabled: row.enabled, rolloutPercent: row.rollout_percent }))
        },
      }
    },
  }
}
