---
description: Run the WorldQuest pre-release checklist
argument-hint: <version> e.g. v1.0.0
---

Run the release checklist for **$ARGUMENTS**.

From `docs/engineering/definition-of-done.md` (release section):

- [ ] Every feature meets the per-feature DoD, or its waiver is logged with an owner
      and a dated issue
- [ ] Full E2E regression green on **real** iOS and Android devices
- [ ] Performance budgets verified on a mid-tier Android (cold start < 2.0 s,
      ≥ 58 fps, bundle < 4 MB)
- [ ] Crash-free sessions ≥ 99.5 % in beta
- [ ] Accessibility: VoiceOver and TalkBack pass on every changed screen
- [ ] i18n: `en` and `sv` complete, pseudo-locale screenshots clean
- [ ] Migrations applied and reversible; rollback plan written
- [ ] Feature flags configured for the staged rollout (5 → 25 → 50 → 100 %)
- [ ] Store metadata, screenshots, and **data-safety declarations match reality exactly**
- [ ] Release notes written in the product voice, not changelog-speak
- [ ] Analytics dashboards updated for new events
- [ ] Support docs updated; support knows what changed
- [ ] Security review passed (`wq-security-privacy-reviewer`)
- [ ] A rollback decision-maker is named and available for 48 h

Report each as ✅ / ⚠️ / ❌ with evidence — not assumptions. For anything ❌, state
whether it blocks the release and why.
