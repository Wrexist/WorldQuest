# Release decisions and evidence

Current as of 13 September 2026. Product/release owner: repository owner. Engineering owns reproducible checks; content editors own fact and translation approval. These are accountable roles, not claims that a staffed team already exists.

The [execution checklist](execution-plan.md) is the only current release backlog. Its action IDs remain stable. The [launch brief](../product/launch-brief.md) sets worldwide English/Swedish scope and priority. The [Phase 1 work log](phase-1-verification.md) records commands, failures, corrections and limits. Historical checklists and build-order notes remain evidence of earlier decisions, not a competing definition of done.

For each phase: identify the audit action; record changed behavior; run the appropriate checks; attach dated evidence; close an action only to the extent its acceptance criteria were demonstrated. A generated file inventory proves source presence, never working billing, live deployment, real learning or device usability. Keep backend migration, device testing and privacy/release approvals open until exercised.

Before each release, reconcile the launch promise against the claim ledger, pack coverage and actual build capabilities. Reject unsupported growth/efficacy claims. Regenerate `pnpm status:generate`, verify `pnpm status:check`, review dependency scanning and update the evidence log. Preserve historical evidence instead of rewriting old failures into passes.

Review competitor positioning and verified pricing quarterly; the next scheduled review is **13 December 2026**. Use the dated audit/research records and primary sources, separating observed mechanics from hypotheses. Review sooner if acquisition, learning or retention results challenge the current brief. New ideas go into their existing later-phase IDs or a clearly marked experiment with a success and stop condition; they do not silently expand the release gate.

Security backports have an earlier deadline: **13 October 2026**, enforced by the security script. The repository owner must monitor Actions failures and assign fixes. Weekly scanning is configured; scheduled runs begin after merge to the default branch.
