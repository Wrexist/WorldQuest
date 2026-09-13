# ADR 0014: Platform-protected native credentials

Date: 2026-09-13. Status: implemented; native acceptance tracked in Phase 2.

## Decision

Use Expo SecureStore 15.0.8 with the existing Expo SDK 54 for credentials on iOS
and Android. Keep synchronous MMKV only for app caches and non-secret installation
metadata. This serves Priya's reliable return to offline practice and Alex's
account continuity. The backend-neutral SessionStorage port already permits async
operations; authentication must await storage before accepting an identity.

New credentials go directly to iOS Keychain / Android Keystore-backed storage.
On iOS use WHEN_UNLOCKED_THIS_DEVICE_ONLY. Do not require biometrics for routine
session reads or silently fall back to unprotected storage when the device is
locked, storage is full or a native module is unavailable. Native values may be
large; write failures propagate, and readback is required before migration is
acknowledged. The native proof includes a 5 KB synthetic session.

This replaces the old MMKV store encrypted with a bundled shared key. A random
MMKV key kept in SecureStore was considered, but direct credential storage avoids
another key lifecycle and MMKV's 16-byte encryption-key limit. The old shared key
remains only in read/delete migration code; it provides no protection guarantee.

## Migration, logout and reinstall

- Migrate all legacy entries, including unused verification keys. An existing
  protected value takes precedence; otherwise copy the legacy value to SecureStore,
  verify both index and value readback, then delete the legacy copy. A failure
  retains the source and fails the operation; it never acknowledges a new login.
- Register protected entry names before writing values, so interrupted writes are
  still discoverable for cleanup. Entries contain backend-specific SDK keys. The
  D1 adapter must use a distinct backend namespace when it is connected.
- Serialize all vault operations. Each transport receives a generation-bound
  handle; logout invalidates it immediately, so old refresh completions cannot
  restore credentials afterward. New transports receive a fresh handle.
- Persist a logout marker before erasure. After interruption, reads finish erasure
  before resolving an identity. Cleanup failures leave the vault closed and retryable.
- An installation marker outside Keychain distinguishes a fresh installation.
  Clear indexed credentials that iOS retained across uninstall before allowing a
  new session. Linked users must sign in again; guest identity recovery after
  uninstall is not promised. Android app backup is disabled, and SecureStore's
  plugin provides its own backup exclusions. Cloud account recovery remains B02.
- Browser previews use memory-only credentials. Reload requires authentication;
  no browser localStorage is treated as protected credential storage.

## Verification boundary

Failure-injection tests exercise interrupted migration, locked storage, failed
readback, simultaneous writes, stale SDK writes, interrupted logout and reinstall.
An isolated native proof uses a separate application ID and no backend, tests the
actual native modules, and is not reachable from the shipped router. It exercises
migration, a process restart, logout and uninstall/reinstall on both platforms.
This does not accept email linking, server revocation, D1 account recovery, the full
device/OS matrix or public API readiness. A new native binary is required; do not
send this dependency change as an OTA update to older binaries.

Sources: [Expo SecureStore SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/)
and installed `react-native-mmkv/src/Types.ts` / `expo-secure-store` declarations.
