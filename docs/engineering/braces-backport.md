# Temporary braces nesting-depth patch

On 3 October 2026, CI run 280 failed the dependency security gate for
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The npm registry still published braces 3.0.3 as its latest version, with no
fixed release. The dependency comes through micromatch in Metro and Jest
tooling; no WorldQuest app or backend input path to these APIs was identified.

`patches/braces@3.0.3.patch` backports the depth guards proposed in
[upstream PR 72](https://github.com/micromatch/braces/pull/72), reviewed at
`d0d575e55e74a4e0218e5248fafb79efc3e54ebb`. That PR was still open, so this is
a local mitigation, not an upstream released fix. The package's MIT license
is retained. Unrelated upstream quote/range parser changes and a change to
`stringify`'s `escapeInvalid` behavior are deliberately excluded.

The parser limits combined brace and parenthesis nesting to 100. Compile,
expand and stringify enforce the same limit for directly supplied syntax
trees. Callers can request a smaller `maxDepth`, but cannot raise the safety
cap. Excessive strings receive a controlled SyntaxError and excessive trees
receive a controlled RangeError before recursive processing exhausts the stack.
Ordinary patterns retain their existing parsing and expansion behavior.

The regression suite first reproduced a stack overflow with 4,000 nested
braces inside the existing 10,000-character limit. Bounded child processes
exercise the public string APIs, parentheses and mixed nesting, supplied syntax
trees, depth boundaries and options. Compatibility cases cover normal patterns
and micromatch's actual dependency resolution.

`pnpm security:check` still displays the registry finding. Its policy accepts
this exact advisory and version only with the recorded patch and installed-file
SHA-256 hashes and passing behavioral regressions. Other findings still fail.
Review before **13 October 2026** with the existing backports; replace this patch
and remove its policy entry when a compatible upstream fixed release is available.
