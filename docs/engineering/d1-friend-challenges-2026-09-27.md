# Private friend challenges — local implementation

The app and D1 Worker implement private, code-only ten-question challenges. Migration
0013 is forward-only. `API_ENABLED` and `CHALLENGES_ENABLED` remain false in the
checked-in deployment configuration. No migration or flag was applied remotely.

## Rules implemented

- Only verified, eligible accounts with a current session may use the endpoint.
  Protected/unknown audience accounts are excluded. There is no classroom mode in
  this implementation; a future classroom account type must remain excluded.
- Invitations use a cryptographically random 96-bit code; only its SHA-256 hash is
  stored by the server. This replaces the earlier six-character concept.
- One invited opponent, identical persisted questions, 48-hour expiry, at most three
  unfinished created invitations. No contact discovery or free text.
- Prompts use the invitation's stored language, matching the saved answer labels,
  without changing either player's language preference elsewhere in the app.
- Accuracy decides the result; elapsed server time from opening breaks ties.
  Pauses count. The UI states this before starting. Scores remain hidden until both
  finish or the invitation expires. An unplayed round is never shown as a zero score.
- Answer IDs are opaque. Correct IDs remain server-only; submission is validated,
  graded, and saved once. Replaying the same submission is safe; changing it fails.
- This pilot awards **no XP or coins**, explicitly stated in the UI. It does not
  alter league rankings or invent reward numbers beyond the balance specification.
- Saved answer drafts survive a failed submission and are removed on confirmation.
  They use existing account-scoped storage; quiz responses are not persisted in the
  TanStack query cache. Invitations can be shared through the user-operated OS sheet.
- Each question starts at the top of the viewport. Native screen-reader focus moves
  to its prompt; a physical VoiceOver pass remains required.
- Hide is silent; blocking prevents further play and future joins in either
  direction. Reports use fixed reasons and enter a real D1 queue. Account deletion
  cascades challenges, plays, hides, blocks, reports and restrictions.

## Operator workflow required before public rollout

An accountable operator and a review cadence have not been assigned. Keep the feature
off until that ownership and two real-account acceptance checks exist. These SQL
examples describe operator actions; none has been executed against a remote database.
Use bound parameters through an authorized operational tool, not interpolated input.

Read the pending queue, oldest first:

```sql
SELECT challenge_id, account_id, target_id, reason, created_at
FROM social_reports WHERE status = 'pending'
ORDER BY created_at LIMIT 100;
```

Inspect only the reported challenge and its participation records. The schema has no
chat or authored names. A report alone does not prove cheating; review timing and
submission evidence before acting. Avoid copying account IDs into public issue trackers.

To temporarily restrict a confirmed abusive account, bind its account ID and an
explicit UTC expiry in milliseconds:

```sql
INSERT INTO social_restrictions(account_id, restricted_until) VALUES (?, ?)
ON CONFLICT(account_id) DO UPDATE SET restricted_until = excluded.restricted_until;
UPDATE social_reports SET status = 'reviewed'
WHERE challenge_id = ? AND account_id = ?;
```

The request eligibility check and transaction guard both enforce that restriction.
To end it early, delete only the reviewed account's `social_restrictions` row. Mark
the particular report `resolved` once the review is complete. User blocks remain
independent of operator restrictions. Document the decision in a restricted operator
record without exporting quiz answers or personal account data.

## Release boundaries

Local automated tests cover actual workerd/D1, not mocked SQL. Browser acceptance
uses two synthetic verified accounts and the real mobile web bundle. This is not a
claim of two-human production verification, physical iPhone testing, TestFlight
distribution, a full friend graph, reactions, or a staffed moderation service.


## PR 23: invitation cancellation

Only an unjoined invitation with no started attempt can be cancelled. The conditional
D1 update checks both conditions at write time, so a concurrent join/start cannot lose
an accepted attempt. The API's `canCancel` capability hides the control once either
player has committed to the round. Tests cover accepted and started rounds, submission
after a rejected cancellation, unused invitations, and concurrent join/cancel requests.
