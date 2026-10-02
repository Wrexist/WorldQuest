# Temporary node-forge signature-validation backport

On 2 October 2026, CI reported [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
in node-forge 1.4.0, pulled in by Expo's CLI and code-signing tooling. There was
no patched npm release at the time of review.

The local pnpm patch rejects extra children inside the RSA PKCS#1 v1.5
DigestInfo algorithm sequence. It implements the validation proposed in
[upstream PR 1152](https://github.com/digitalbazaar/forge/pull/1152), which was
still open when reviewed; this is not an upstream released fix.

The regression creates an ephemeral signing key and exercises actual signature
verification. Valid SHA-256 DigestInfo values with and without the optional NULL
parameter remain accepted. Extra fields and duplicate parameters are rejected.
The extra-field assertion failed against the original package and passed after
the patch. All six dependency security regressions pass.

`pnpm security:check` continues to display registry findings. It accepts this
specific advisory/version only after checking the patch hash, installed-file
hash, and behavioral regressions. Unrelated findings still fail the check.

Review before **13 October 2026**, together with the existing backports. Replace
the patch with an upstream fixed release once compatible, then remove its policy
entry. This finding concerns bundled build tooling; no claim of an exploitable
WorldQuest application runtime path has been established.
