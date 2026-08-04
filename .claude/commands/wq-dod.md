---
description: Run the WorldQuest Definition of Done check on the current work
---

Run the Definition of Done check on the current changes.

Invoke the `worldquest-definition-of-done` skill.

1. Run `pnpm verify` (typecheck · lint · test · content · i18n · a11y) and report the
   real output — if something fails, say so.
2. Walk every item in `PROJECT.md §12` by hand. Most of it cannot be automated.
3. For each item: ✅ done · ⚠️ done with a caveat · ❌ not done.
4. For anything ❌, state what remains and roughly what it costs.

**Report honestly.** Never claim complete with an unticked box. The correct output for
unfinished work is "done except X, which needs Y" — not a green tick.

Remember what is never waivable under any deadline: server-authoritative rewards,
child-privacy rules, data deletion, and shipping a wrong fact.
