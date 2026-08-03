# Vendored skills — where they came from and what changed

Three skills in this directory are third-party. They are checked in rather than
installed into `~/.claude/skills/` on purpose: a home directory is one machine's, and
this repo's `.claude/` is already how the team ships procedural knowledge — versioned,
reviewable, and present for whoever clones it next.

Everything here was checked for a licence before being copied. That is not
box-ticking: this repo blocks flags, landmarks and sound on exactly the same question,
and vendoring an unlicensed file into a shipping product would be the same mistake with
a different file extension.

| Skill | Upstream | Licence | Modified |
|---|---|---|---|
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) `skills/frontend-design` | Apache-2.0 (`LICENSE.txt`) | No — verbatim |
| `mobile-app-ui-design` | [ceorkm/mobile-app-ui-design](https://github.com/ceorkm/mobile-app-ui-design) | MIT (`LICENSE`) | No — verbatim, plus `references/` |
| `design-review` | [OneRedOak/claude-code-workflows](https://github.com/OneRedOak/claude-code-workflows) `design-review` | MIT (`LICENSE`) | **Yes — rewritten** |

## What changed in `design-review`, and why

Upstream drives the **Playwright MCP server**, which this workspace does not have. The
method — "Live Environment First", the triage matrix, problems-not-prescriptions — is
theirs and is kept. The apparatus is this repo's, because it was already here: `pnpm
e2e` exports the app through Metro and drives it in Chromium, and `scripts/design-shots.cjs`
is that same apparatus pointed at an arbitrary route list.

Also added, because they are specific to this product: the mockup and
`mockup-fidelity.md` as review inputs; a rule to cite the existing gates
(`design:contrast`, `e2e`, `lint:a11y`) rather than re-deriving them by eye; and a
required closing statement that none of it has been seen on a phone.

The subagent lives at `.claude/agents/wq-design-reviewer.md` and the command at
`.claude/commands/design-review.md`.

## Deliberately NOT vendored

[tommyjepsen/awesome-ux-skills](https://github.com/tommyjepsen/awesome-ux-skills) —
`design-analysis` and `craft` are genuinely good and there is **no licence file in the
repository**, which means all rights reserved and no grant to copy them here.

Both capabilities were rebuilt native instead, which was the better answer anyway:

- **`worldquest-design-forensics`** replaces `design-analysis`. The original emits
  shadcn/Tailwind CSS variables; this app is React Native with no CSS custom properties,
  a step-indexed spacing scale, and one font family per weight. It also reports every
  colour against *our* canvas, which is the number that decides adoptability here.
  Backed by `scripts/measure-design.cjs`.
- **`worldquest-visual-craft`** replaces `craft`. The original's first rule is "no
  gradients"; `Card` in this repo uses one deliberately, with a documented reason. Its
  rules are CSS-shaped (`transition: all`), and the React Native equivalents are
  different sins. Twelve rules, same spirit, this codebase's actual traps — and a table
  of which ones are already enforced by a script.

If that repo adds a licence, revisit: the originals are worth having.

## Updating a vendored skill

Re-clone upstream, diff against the copy here, and take the change deliberately. For
`design-review`, expect the diff to be large — it has been rewritten, and the useful
question is whether upstream's *method* has changed, not its text.
