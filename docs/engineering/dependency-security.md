# Dependency security, Phase 1

Reviewed 13 September 2026. Owner: repository maintainer. Run `pnpm security:check`; evidence is written to `node_modules/.cache/security-report.json` and uploaded by CI. Review local backports **before 13 October 2026**. The gate deliberately expires instead of accepting an exception indefinitely.

The original production dependency graph contained 38 advisory/version entries, 28 distinct advisory IDs: 30 high, eight moderate, zero critical. Expo declares its build tooling as production dependencies, so this graph is broader than code executing on a phone. Audit paths alone do not prove an exploitable app entry point.

## Resolution and reachability

| Dependency | Resolution | Relevant exposure |
|---|---|---|
| postcss 8.4.49 | Override 8.x to 8.5.28 | Expo/Metro CSS processing during web builds; untrusted styles/build inputs |
| nanoid 3.3.16 | Override 3.x to 3.3.19 | React Navigation identifiers; runtime dependency |
| fast-uri 3.1.5 | Override 3.x to 3.1.7 | AJV/schema URL processing in tool/config paths |
| @xmldom/xmldom 0.8.13 / 0.9.10 | Keep families, update to 0.8.15 / 0.9.12 | Expo plist/XML processing; mostly build inputs |
| js-yaml 3.15.1 / 4.3.1 | Keep families, update to 3.15.2 / 4.3.2 | CLI/config input parsing |
| uuid 7.0.3 under xcode | Scoped `xcode>uuid` override to 11.1.1 | Xcode project generation uses v4, while the advisory concerns v3/v5/v6 buffer writes; upgrade still removes the affected dependency |
| image-size 1.2.1 | Local bounds/progress patch | Metro parses image assets; malformed ICNS or ISO/JXL input can hang workers. No shipped remote-image upload entry point was found in this audit |
| decode-uri-component 0.2.2 | Backport 0.5.0 linear decoder, retain CommonJS and plus-to-space API | React Navigation → query-string → deep-link parameters; malformed links are a runtime concern |

Expo 54, React Native 0.81.5 and React 19.1 remain on their existing framework versions. The decoder's upstream 0.5.0 is ESM; a direct override would change the CommonJS API consumed by query-string 7. The patch retains the original MIT license and copies the upstream decoder helpers, preserving the old module export and plus handling.

The image patch requires full eight-byte entry headers and in-file ICNS lengths. ISO size-zero boxes extend to EOF, so their returned size is positive. Short/oversized boxes are rejected. Extended-size boxes remain unsupported by this version's fixed-offset parser. This is a targeted mitigation, not a claim to have audited every image format.

After updates the raw registry scan reports **three entries: two high image-size advisories and one moderate decoder advisory**. Registries identify package versions and cannot recognize these local changes. Do not describe this as a zero-vulnerability registry scan.

`patches/security-policy.json` accepts only those three IDs for the exact package versions, verifies the patch-file and installed-file SHA-256 values, runs bounded behavioral regressions, and fails for unexpected findings or invalid registry responses. The lockfile also pins patch application. Removing a patch or changing the installed parser fails the gate; ordinary `pnpm test` includes the parser/decode regressions.

Tests cover hostile ICNS lengths, truncated headers, JXL zero-size partial streams, HEIF/ISO traversal, normal PNG/HEIF dimensions, Unicode/plus/malformed query parsing, a long malformed input, and xcode's actual UUID resolution and identifier generation. Hostile parsers run in child processes with a five-second hard timeout.

Native exports verify module resolution and unchanged size budgets; they do not certify execution in Hermes, native config-plugin behavior on macOS, or supported OS versions. Native device/build acceptance remains in the release checklist. Do not activate a new SDK based only on these exports.

## Automation and maintenance

CI runs the same gate on pushes and pull requests. The separate Monday security workflow becomes scheduled when this branch is merged into the default branch; GitHub does not schedule workflows exclusively on feature branches. A maintainer must review failed scans, check upstream fixes, remove obsolete overrides/backports, rerun the full gates and record the resulting advisory inventory. Renovation of Expo itself is a separate compatibility change, not an unattended major upgrade.

Primary upstream material: [UUID maintainer advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), [decoder source and releases](https://github.com/SamVerschueren/decode-uri-component), [image-size vulnerability research](https://joshua.hu/image-size-infinite-loop-dos-vulnerabilities). Version and installed-path evidence comes from the npm registry, pnpm lockfile and local resolution probes. The exact accepted advisories are linked in the saved scan report.
