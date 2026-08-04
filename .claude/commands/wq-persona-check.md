---
description: Decide whether a WorldQuest feature should be built, and for whom
argument-hint: <feature description>
---

Evaluate this feature against the personas and the Product Bible: **$ARGUMENTS**

Invoke the `worldquest-persona-check` skill.

Produce exactly this:

```
Feature:
Primary persona:      (one of the eight, by name)
Also serves:
Harms:                (who, and how it's made disableable)
Loop stage:           learn | return | share | pay
Metric moved:
Guardrails at risk:
Roadmap phase:        (and whether that's the phase we're in)
Complexity cost:
What we say no to in exchange:
Kill criterion:
Verdict:              build now | build later | don't build
```

Check the standing no-list first (open chat, loot boxes, learning-blocking energy,
ads, unmoderated UGC before v4.0). If it's there, the answer is no and the reason is
documented.

If you can't name a primary persona, say so — that is the finding, and the feature
isn't ready to build.
