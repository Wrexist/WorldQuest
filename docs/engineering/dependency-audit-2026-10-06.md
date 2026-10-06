# Dependency audit repair — 6 October 2026

Both verify jobs on PR #32 stopped at `pnpm security:check` with three new registry findings, before the app tests ran. The security gate and its review deadline remain unchanged.

- `source-map-js` is pinned to upstream **1.2.2**, fixing [indexed-map offset denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). A subprocess regression checks rejected oversized offsets and bounded processing after generated code is exhausted.
- `compression` is pinned to upstream **1.8.2**, fixing [zlib resources retained after an aborted response](https://github.com/expressjs/compression/security/advisories/GHSA-vc2v-76pw-4v95).
- `sprintf-js@1.0.3`, used by the legacy argparse dependency, has no published patched version for [unbounded numeric precision](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). The local patch clamps numeric precision to JavaScript's maximum of 100 before Number formatting; `%g` uses a minimum of 1. Ordinary valid precision, padding, positional/named arguments and string formatting retain their behavior. Excessive precision now produces bounded output instead of an uncaught RangeError.

The sprintf patch changes only the package's `src/sprintf.js` runtime entry. The security policy accepts only this exact package/advisory with SHA-256 checks on both the patch and installed source, plus passing behavioral regressions. It does not suppress unrelated findings. Review before **13 October 2026**, replacing the patch when a compatible upstream fix is available.

`pnpm security:check` passes with 13 security regression tests and zero unexpected findings. Registry entries for the existing hash-verified local patches remain visible in the report.
