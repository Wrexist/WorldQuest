/**
 * The Supabase client.
 *
 * One place where the app touches the network. Everything above it works with
 * domain types; everything below is an implementation detail that could be swapped
 * for a different backend by rewriting this file alone.
 *
 * Spec: docs/engineering/architecture.md · docs/adr/0003-backend-supabase.md
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type WorldQuestConfig = {
  readonly url: string
  readonly publishableKey: string
}

/**
 * Only the publishable key ever reaches the client bundle. The service-role key
 * exists solely in edge functions — if it appears in anything shipped to a device,
 * every RLS policy in the schema is decoration.
 */
export function createWorldQuestClient(config: WorldQuestConfig): SupabaseClient {
  if (!config.url || !config.publishableKey) {
    throw new Error(
      'Supabase config missing. Copy .env.example to .env.local — see README.',
    )
  }
  if (config.publishableKey.startsWith('sb_secret') || config.publishableKey.includes('service_role')) {
    // Cheap check, enormous consequence. Worth failing loudly at startup.
    throw new Error('Refusing to start: a service-role key was passed to the client.')
  }

  return createClient(config.url, config.publishableKey, {
    auth: {
      // Anonymous sign-in backs the taster lesson: a user completes a real lesson
      // before we ask for an account, then upgrades in place without losing it.
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}

export type SubmitLessonRequest = {
  lessonId: string
  kind: 'lesson' | 'quest' | 'review' | 'challenge' | 'event'
  topicId?: string
  startedAt: number
  answers: readonly unknown[]
  clientVersion?: string
}

export type SubmitLessonResponse = {
  lessonId: string
  items: number
  correct: number
  accuracy: number
  xpAwarded: number
  coinsAwarded: number
  perfect: boolean
  rejected: number
  replayed: boolean
}

/**
 * Submit a finished lesson for authoritative grading.
 *
 * Note what is NOT in the request: xp, coins, mastery, streak. The client sends
 * answers; the server computes rewards. See ADR 0006.
 */
export async function submitLesson(
  client: SupabaseClient,
  request: SubmitLessonRequest,
): Promise<SubmitLessonResponse> {
  const { data, error } = await client.functions.invoke<SubmitLessonResponse>(
    'submit-lesson',
    { body: request },
  )
  if (error) throw error
  if (!data) throw new Error('submit-lesson returned no body')
  return data
}
