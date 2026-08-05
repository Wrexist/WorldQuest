# Security & privacy

Two of our eight personas are children, and a third is a parent buying *on the basis
of trust*. Privacy is not compliance overhead here — it is the product feature Marcus
is paying for.

---

## 1. Roles

Defined in the schema from day one so that adding a capability later is a permission
grant, not a migration.

| Role | Can |
|---|---|
| `guest` | Play the taster lesson; local progress only, no cloud save |
| `user` | Everything core; own data only |
| `premium` | + unlimited hearts, offline packs, deep stats, premium cosmetics |
| `teacher` | + create orgs, assignments, read member aggregate progress |
| `parent` | + link child accounts, read child aggregate progress, set limits |
| `moderator` | + read reports, act on handles and accounts |
| `support` | + read account metadata (never `review_log` content), issue grants |
| `admin` | + everything, fully audit-logged |

**Capability rules**
- A role is granted server-side only. A client cannot request one.
- `teacher` and `parent` require verification before they can read anyone else's data.
- Every `moderator`, `support`, and `admin` action writes to `audit_log`.
- **No role can read another user's raw answers.** Not teachers, not parents, not
  support, not admins. Aggregates only. This is a deliberate architectural limit, not
  a policy anyone can override in an emergency.

## 2. Authentication

- Supabase Auth: Apple, Google, email+password, and anonymous (guest).
- **Sign in with Apple is mandatory** if any other social login exists (App Store rule).
- Guest → account upgrade preserves all local progress. Losing a child's first week
  because they didn't sign up is unforgivable.
- JWT: 1 h access token, rotating refresh token, refresh revoked on password change.
- Biometric unlock is opt-in and local-only (it gates the app, not the session).
- Rate limits: 5 sign-in attempts / 15 min / IP; 3 password resets / hour / account.
- No email enumeration — the reset response is identical for known and unknown addresses.

## 3. Authorisation — RLS

Default deny on every table. The client has **no write access** to `xp_ledger`,
`coin_ledger`, `user_facts`, `review_log`, `league_members`, or `entitlements`;
those writes exist only in edge functions running as the service role.

Policies and their tests: [`data-model.md`](data-model.md#row-level-security).
`supabase/tests/rls.test.sql` asserts per table that user A cannot reach user B's
rows. **RLS bugs are silent and total** — they get tests like any other logic.

## 4. Server-authoritative progress

Everything that produces a reward is computed server-side. The client's numbers are a
prediction it renders for responsiveness.

```
client: "I completed lesson X with these 10 answers"
server: re-derives ratings → runs the SAME engine → writes state → returns the truth
client: reconciles; server wins; mismatch is logged
```

There is no endpoint that accepts "give me 500 XP".

## 5. Anti-cheat

| Vector | Defence |
|---|---|
| Forged results | Server re-grades from submitted answers; XP is computed, never accepted |
| Replay | `lessons.id` is a client UUID and a primary key — duplicates are no-ops |
| Impossible speed | Answers < 400 ms earn nothing and don't affect scheduling |
| Forged answer times | `answeredAt` is clamped to `[startedAt, now]` and made monotonic; `startedAt` to a 7-day window. Nothing may be dated in the future — that was minting mastery, the overdue bonus and `factMastered` XP together. `_shared/submission-time.ts` |
| Forged answer durations | `elapsedMs` capped by the gap to the next answer. A session shorter than 400 ms × items has its timing discarded entirely and grades as average — the server cannot prove an answer was slow, so it declines to infer rather than paying out |
| Clock manipulation | Server timestamps are authoritative for streaks, dailies, heart regen |
| Scripting | Rate limits + behavioural flags (inhuman timing variance, sustained 100 % at speed) |
| Modified client | Signed content packs; every award server-validated |
| Leaderboard gaming | Server-computed; flagged accounts are **shadow-segregated** into flagged-only cohorts |
| Multi-accounting for referrals | Referral XP requires the invitee to complete 5 lessons across 3 days |

**Shadow-segregation over banning.** A false-positive ban on a 12-year-old is a
support nightmare and a 1★ review; a false-positive segregation is invisible and
reversible. Bans are for confirmed, repeated abuse only, and are reviewed by a human.

## 6. Children — COPPA & GDPR-K

**Age gate:** a neutral date-of-birth entry at signup (never "are you over 13?", which
teaches children to lie). We store `birth_year` only.

### Under 13 (or under the local digital-consent age — 16 in several EU states)

| Rule | Implementation |
|---|---|
| Verifiable parental consent before account creation | Parent email + confirmation flow, recorded in `consent_records` |
| **No third-party analytics** | The analytics adapter is a no-op for `is_child` |
| **No advertising identifiers** | Never collected on any account |
| **No social features** | Absent, not merely disabled |
| **No purchases** | Purchase UI hidden entirely; Premium via the Family plan only |
| Minimal data | No email for the child, no real name, no location, no photo |
| Parent access | View progress, delete the account, export data |
| Notifications | 1/day max, never after 19:00 local |
| Retention | Purged 30 days after deletion, no exceptions |

**`is_child` is set once at signup from the age gate and is immutable thereafter.** A
child cannot age out of protection by editing a field, and the flag is enforced in
RLS and in the analytics adapter — not just in the UI.

### 13–17
Friends by code only, no discovery, no global leaderboards, analytics consent required
where the local age of consent is higher.

## 7. GDPR

| Right | Implementation |
|---|---|
| Access (Art. 15) | `export-user-data` → JSON archive of everything we hold |
| Portability (Art. 20) | Same, in a machine-readable format |
| Erasure (Art. 17) | `delete-user`: soft delete → 30-day grace → hard purge |
| Rectification (Art. 16) | Editable profile; support path for the rest |
| Object / restrict | Analytics opt-out; notification opt-out; both fully honoured |
| Data minimisation | We collect birth *year*, not date. No location. No contacts. |
| Purpose limitation | Learning data is never sold, never shared with advertisers |

**Sub-processors** (to be listed publicly): Supabase (hosting/DB, EU region), PostHog
(analytics, EU), Sentry (errors), RevenueCat (subscriptions), Expo (OTA updates),
the push providers (APNs/FCM). A DPA with each before v1.0.

**Data residency:** EU by default. `TODO(verify)` before v1.0 whether a US region is
needed for latency, and how that interacts with EU child data.

## 8. Application security

| Area | Control |
|---|---|
| Transport | TLS 1.3, certificate pinning for the API |
| Secrets | Never in the client bundle; edge functions and CI secrets only |
| Local storage | MMKV encrypted at rest; tokens in Keychain/Keystore |
| Input validation | Zod at every boundary: network, storage, packs, deep links, push payloads |
| SQL | Parameterised only; no dynamic SQL from user input |
| Dependencies | Dependabot + `pnpm audit` in CI; a high-severity CVE blocks the merge |
| Content packs | Signed; signature verified before load |
| Deep links | Whitelisted routes; params validated; never `eval` a payload |
| Web (v2.0) | CSP, SameSite cookies, CSRF tokens |
| Logging | No tokens, no PII, no answer content in logs |

## 9. Rate limiting

| Endpoint | Limit |
|---|---|
| `submit-lesson` | 60 / hour / user *(a 5-min lesson can't exceed this honestly)* |
| Auth | 5 / 15 min / IP |
| Password reset | 3 / hour / account |
| Friend requests | 20 / day / user |
| Challenges | 10 / day / user |
| Reports | 10 / day / user |
| Content download | 100 / hour / user |
| Global per-IP | 1000 / hour |

Enforced at the edge. Exceeding a limit returns 429 with `Retry-After` — the client
backs off silently and **never loses queued progress**.

## 10. Incident response

| Severity | Example | Response |
|---|---|---|
| **P0** | Data breach, child data exposure, auth bypass | Immediate: contain, assess, notify within 72 h (GDPR Art. 33) |
| **P1** | Wrong fact shipped, progress loss, payment failure | Same-day hotfix (content = CDN, no store review) |
| **P2** | Feature broken for a subset | Next release or a feature-flag disable |
| **P3** | Cosmetic | Backlog |

Every non-core system sits behind a feature flag so it can be disabled server-side
without a release. Post-incident: a blameless write-up within 5 days, with the
prevention change tracked as work, not a note.

## 11. Content licensing

A real blocker, tracked here so it doesn't surprise us in v1.5.

| Asset | Position |
|---|---|
| **Flags** | Most national flag designs are public domain; SVG sets (e.g. `flag-icons`) carry permissive licences — **`TODO(verify)` each set's licence and record it in the pack** |
| **Map geometry** | Natural Earth is public domain; OSM-derived data is ODbL and carries attribution obligations — pick one and record it |
| **Landmark photographs** | **The expensive one.** Wikimedia is mixed-licence; many images require attribution or are non-commercial. Either license a stock set, commission illustrations, or use only CC-BY with in-app attribution |
| **Country facts** | Facts aren't copyrightable; a *database* can be. Use primary sources (UN, World Bank) and cite them |
| **Fonts** | Inter (OFL) and Baloo 2 (OFL) — both fine, ship the licence |
| **Sound** | Commission or buy a royalty-free pack with a recorded licence |

**Every asset records `license` and `attribution` in its pack, and CI rejects an asset
without them.** An in-app Attributions screen lists them all.

**Recommendation:** budget for illustrated landmarks rather than photography. Cheaper
in aggregate, legally clean, more on-brand, and it makes the app look like itself
rather than like a stock library.

## 12. Pre-launch security checklist

- [ ] RLS enabled and **tested** on every table
- [ ] No client write path to any reward table
- [ ] Secrets absent from the bundle (verified by scanning a release build)
- [ ] Certificate pinning live
- [ ] Rate limits live and load-tested
- [ ] Age gate + parental consent flow tested end to end
- [ ] Analytics no-op verified for `is_child`
- [ ] Data export and deletion tested end to end
- [ ] DPAs signed with every sub-processor
- [ ] Privacy policy and terms published, and readable by a 12-year-old
- [ ] App Store / Play data-safety declarations match reality **exactly**
- [ ] Penetration test of the auth and reward paths
- [ ] Incident runbook written and rehearsed once
