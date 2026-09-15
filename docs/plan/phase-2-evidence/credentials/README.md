# Credential-storage evidence

The proof runs under `com.wrexist.worldquest.credentialsproof`, with synthetic
credentials and no backend. It is not reachable from the production app router.
Run the **Native credential acceptance** workflow with `platform=both` to rebuild
and repeat it. The Android build must compile the patched SecureStore module from
source. The iOS build must use Xcode's simulated entitlements at link time.
For a recent recorded build, the manual **iOS credential proof replay** workflow
accepts its run ID and reuses the signed binary without rebundling. Build artifacts
expire after seven days; the checked-in screenshots and result record remain.
The reinstall flow handles iOS's first-link confirmation before asserting the
result, following [Maestro's documented behavior](https://docs.maestro.dev/api-reference/commands/openlink).

- `*-credential-migration.png`: legacy session and unused verifier migrated;
  a new 5 KB session is ready for a real process restart.
- `*-credential-logout.png`: restart preserved the session; logout erased session
  and verifier, and an old client could not restore them. A synthetic session is
  then stored for the uninstall/reinstall test.
- `*-credential-reinstall.png`: the reinstalled app did not adopt the old session.
  The marker distinguishes retained iOS Keychain data from Android's erased store.
- `android-native-unit-tests.xml`: three tests invoke the installed Kotlin
  persistence method with a SharedPreferences cache/disk failure model. This is
  deterministic failure injection, not a physical disk-full test.
- `en-*` / `sv-*`: Chromium captures of the actual Settings renderer at 320 pt,
  normal/doubled text and the scrolled retry state. They are not native screenshots.
- `results.json`: exact source revisions, run references, counts and limitations.

The full physical-device, OS and screen-reader matrix remains A11. Native D1
accounts, server revocation and recovery remain B02. See
[ADR 0014](../../../adr/0014-native-credential-storage.md) and the
[Phase 2 work log](../../phase-2-verification.md).
