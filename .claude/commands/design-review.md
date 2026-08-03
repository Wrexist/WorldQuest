---
description: Review the rendered UI on this branch by looking at it — screenshots at three viewports, then the diff
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill, Task
---

Run a design review of the UI changes on this branch.

BRANCH DIFF (files only — the pictures are the evidence, not this):

```
!`git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~5..HEAD`
```

OBJECTIVE

Invoke the `design-review` skill and follow it exactly. In particular:

1. **Render first.** `pnpm design:shots` — or pass just the routes the diff touches if
   it is a narrow change. Do not skip this because the diff looks readable.
2. **Open the screenshots.** Read the PNGs in `node_modules/.cache/wq-design-shots/`.
   A review written from `report.json` alone is not a design review, and saying "the
   screenshots look good" without having opened one is the failure mode this command
   exists to prevent.
3. Cross-check against `docs/design/design-system.md`, the mockup at
   `docs/design/assets/mockup-v1.png`, and `docs/design/mockup-fidelity.md`.
4. Cite the gates rather than re-deriving them: `pnpm design:contrast` for contrast,
   `pnpm e2e` for 200 % text and the flow.
5. Triage every finding (Blocker / High / Medium / Nit) and describe problems rather
   than prescribing pixel values.

Reply with the markdown report and nothing else. End it with what was not covered —
which always includes that none of it was seen on a phone.
