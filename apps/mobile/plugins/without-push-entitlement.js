/**
 * Removes the `aps-environment` entitlement that `expo-notifications` adds for us.
 *
 * ## Why this exists
 *
 * The 2026-08-16 TestFlight run compiled, bundled, signed nothing and died in `archive`:
 *
 *     Provisioning Profile "*[expo] com.wrexist.worldquest AppStore …" does not support
 *     the Push Notifications capability.
 *     Entitlements file defines the value "aps-environment" which is not registered for
 *     profile "…".
 *
 * `expo-notifications` ships an `app.plugin.js`, so Expo applies its config plugin
 * whenever the package is installed — it does not have to be listed in `app.json`, and it
 * was not. That plugin writes the entitlement unconditionally
 * (`withNotificationsIOS.js`: `if (!config.modResults['aps-environment']) … = mode`).
 * The App ID `com.wrexist.worldquest` has no Push Notifications capability, so the
 * provisioning profile carries no matching entitlement, and Xcode refuses to sign.
 *
 * ## Why removing it is the right half of the fix
 *
 * **This app sends no remote push.** `src/lib/notifications.ts` says so in its own header
 * — "Local, not push … needs no server, no push token, no APNs certificate, and works
 * with the radio off" — and nothing anywhere calls `getExpoPushToken`,
 * `getDevicePushToken` or `addPushTokenListener`. The daily reminder is scheduled with the
 * OS from a plan computed on device.
 *
 * The six notification types that DO need push are listed in
 * `packages/engines/src/notifications/index.ts` as `NEEDS_PUSH`, with a sentence each on
 * why they cannot be local. None of them is built, because none of them can be until
 * there is a push service to build them against.
 *
 * So the entitlement was describing a capability the binary never exercises. The other
 * fix — enabling Push Notifications on the App ID and regenerating the profile — is
 * equally valid and is the one to take **when `NEEDS_PUSH` starts being implemented**. It
 * needs an interactive Apple login, which CI does not have: EAS syncs capabilities to the
 * App ID only when authenticated with Apple, and the runner holds `EXPO_TOKEN`, which
 * authenticates to Expo. The build log is explicit — "Skipping Provisioning Profile
 * validation on Apple Servers because we aren't authenticated."
 *
 * ## Why this is FIRST in `app.json`'s plugins array, and `expo-notifications` is last
 *
 * **Expo runs entitlement mods last-registered-first.** Each `withMod` wraps the chain
 * that already exists and calls its own action *before* delegating to it, so the plugin
 * you list last is the one that runs first.
 *
 * That is the opposite of the intuition, and it is not a detail worth being clever about:
 * the first version of this file sat at the END of the array, reasoning that "later
 * registration wins". Prebuilt, the entitlement was still there —
 *
 *     <key>aps-environment</key><string>development</string>
 *
 * — because the delete ran before `expo-notifications` had added anything, and then
 * `expo-notifications` added it. Listed first, this runs last, and the file comes out
 * `<dict/>`.
 *
 * `expo-notifications` is named explicitly rather than left to autolinking so that the
 * relative order is written down instead of inferred. Autolinking skips a plugin already
 * in the array, and it is passed no options, so nothing else about notifications changes.
 *
 * Both facts above were established by running `npx expo prebuild --platform ios --clean`
 * and reading `ios/WorldQuest/WorldQuest.entitlements`, which is the only thing that
 * actually answers the question. If a future SDK reintroduces the key, that file is where
 * it shows up — and `ios/` is gitignored, so re-running that command is the check.
 */

const { withEntitlementsPlist } = require('expo/config-plugins')

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment']
    return mod
  })
}
