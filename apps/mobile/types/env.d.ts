/**
 * The app's environment contract.
 *
 * Declared here rather than by pulling in `@types/node`, which would put `fs`,
 * `child_process` and `Buffer` into autocomplete for screen code — none of which
 * exist on a phone, all of which will eventually be reached for.
 *
 * Only `EXPO_PUBLIC_`-prefixed variables are inlined into the bundle by Expo.
 * Anything else stays out of the binary, which is the behaviour we want for
 * everything that is not on this list. Adding a variable means adding it here, to
 * `.env.example`, and to the CI/EAS secret set — the type error is the reminder.
 */
declare const process: {
  readonly env: {
    /** e.g. https://tjdjogidudjobxipibqb.supabase.co */
    readonly EXPO_PUBLIC_SUPABASE_URL?: string
    /**
     * The PUBLISHABLE key (`sb_publishable_…` or the legacy anon JWT). Never the
     * service-role key — `createWorldQuestClient` refuses to start if it sees one,
     * because a service-role key in a client bundle makes every RLS policy in the
     * schema decorative.
     */
    readonly EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string
    /**
     * Crash reporting. Absent means no reporting at all rather than a half-configured
     * client — see `src/lib/reporting.ts`.
     *
     * A DSN is public by design: it identifies a project to receive events and grants
     * no read access, which is why it belongs on the `EXPO_PUBLIC_` list. That is not
     * true of a Sentry *auth token* (used for uploading source maps at build time),
     * which must stay in CI and never carry this prefix.
     */
    readonly EXPO_PUBLIC_SENTRY_DSN?: string
    readonly NODE_ENV?: 'development' | 'production' | 'test'
  }
}
