# Screen catalogue

> **Historical specification/status — superseded for release planning on 13 September 2026.** Use the [current execution checklist](../plan/execution-plan.md), [evidence log](../plan/phase-1-verification.md) and [launch brief](../product/launch-brief.md). Feature lists and checked boxes below describe earlier targets or checks, not current device, backend or store certification.

Two lists: the **15 designed screens** from
[`../design/assets/mockup-v1.png`](../design/assets/mockup-v1.png), and the **22
hidden screens** that teams forget until launch week. Both are required for v1.0
unless marked otherwise.

**Every screen ships five states: content · loading · empty · error · offline.**
That is 5 × the count below. Plan accordingly — it is the single most underestimated
number in the project.

---

## Part 1 — the designed screens

### 1. Splash
Logo, tagline "Become the smartest explorer on Earth", Atlas on the globe.
**Purpose:** cover the auth check and content-index load. **Budget: 1.2 s max** —
if we're slower, we're showing a loading screen and calling it branding.
**Edge cases:** update-required, maintenance, no-network cold start (go straight to
cached Home).

### 2. Onboarding
3 value slides → age gate → daily goal picker → **taster lesson** → optional sign-up.
`Get Started` (blue) · `I already have an account`.
**The rule:** the user completes a real lesson *before* we ask for an account. This is
the single highest-leverage conversion decision in the app.
**Age gate:** neutral date-of-birth entry, no "are you over 13?" — under-13 branches
to the child flow (no social, no third-party analytics, parental email for consent).

### 3. Home
Avatar · coins · greeting by time of day · fact row (streak when above 0, earned title,
quest count, league when there is one) · **the first-week course path** — a banner per
unit (unit number, title, objective, done count; Atlas in the current unit's) and its
steps in a gentle zig-zag · Today's Quest card, secondary (blue `Start quest`) · streak
news · reminder ask · Your world · tab bar. The mockup's Daily Challenge, Friends and
League tiles are not drawn ([mockup-fidelity.md](../design/mockup-fidelity.md)).
**The one primary action is the current step** (launch brief: one green recommendation;
L08/P07/U05). It is larger, green on its edge, and carries a `Start` callout with the
step's objective and "Lesson n of m"; one tap starts its lesson (`/lesson?node=<id>`).
A done step shows a tick and opens a card offering `Practise`; a step not open yet is
dimmed with a lock badge and opens a card saying how it opens — no dead taps.
Screen-reader order is path order, and every step's label carries its place, state and
objective. A finished lesson started from a step counts towards it (account-scoped,
on this device). The course ends: after its check, a card offers `Keep reviewing` (L15).
**Empty (day 1):** no streak tile; the path opens on step 1 with its callout; the quest
reads 0 of 5. **Error:** a course pack that does not parse shows a card saying so, with
`Practise now` — lessons do not depend on the course. **Loading:** a skeleton in the
path's shape. **Offline:** the banner is pinned above the scroll view; on D1 builds the
current step's lesson is kept saved so `Start` works on a plane, and with that spent the
lesson says it needs a connection (and offers Back) rather than playing another.
On a short phone Home scrolls the current step into view — the least movement that shows
it whole — so the banner and `Start` share the first screen at 320 × 568.
**The greeting is localised and time-aware** — `home:greeting.{morning|afternoon|evening}`.
Course data: `packages/content/packs/courses/first-week.v1.json`
([content-pipeline.md §3b](../systems/content-pipeline.md#3b-courses)).

### 4. Daily Quest
5 challenges, each with title, subtitle, XP value and a completion tick.
`Start Quest` (blue). Header shows total reward.
**States:** none done · partially done (resume) · all done (celebration + tomorrow's
countdown).

### 5. Lesson runner ★
The most important screen in the app. Close button · progress bar · item counter
(`2 / 10`) · hearts · the question · answer options.
**Question types (v1.0):** tap-the-country (map) · flag → country · country → capital ·
landmark → country · speed round.
**Interaction rules:** options are ≥ 56 pt tall; tapping an option **selects** it
(changeable) and a single primary **Check** grades it — Check is disabled until something
is selected, and the answer timer stops at Check, not at the tap; Check is pinned at the
bottom, except below 600 pt of height (iPhone SE 1) where it follows the options and
selecting scrolls it into view; no auto-advance before the user sees feedback; answering
is impossible during the feedback animation (double-tap protection); the back gesture
confirms before discarding. Speed round: a selection still unchecked at the buzzer is
graded; no selection is a timeout.
**States:** loading items · presenting · answered-correct · answered-wrong · out of
hearts · paused · network lost mid-lesson (continue offline, queue the writes).

### 6. Correct answer / feedback
Confetti · "Perfect!" · the entity (flag + name) · `+10 XP` and `🪙 +5` · `Continue`
(green) · streak bonus line.
A bottom sheet that rises into place (`motion.base`, instant under Reduce Motion) with a
calm tint: `feedback.correctSurface` when right, the muted plum `feedback.wrong` when
wrong, the neutral surface when the clock ran out. Screen-reader focus moves to the verdict.
**The wrong-answer variant is equally designed and must not feel like a punishment:**
show the correct answer, one sentence of why it's memorable, no red flash, no sound of
failure — a neutral tone. Copy rules in
[`../design/voice-and-tone.md`](../design/voice-and-tone.md).

### 7. Country page
Hero photo · favourite (heart) · About grid (capital · population · currency ·
language) · four quick actions (Lessons · Facts · Landmarks · Stats) · Your Progress
(`18 / 25` lessons).
**Also the web share target** — this page is our SEO surface.
**Data note:** every field shows a source on long-press; volatile fields (population)
show `as of <year>`.

### 8. Explore — globe
Interactive globe with pins, filter button, `Search Country…`.
**Performance:** vector, not tiles; must run at 60 fps on a mid-tier Android; falls
back to the flat continent grid (screen 9) on low-end devices or reduced motion.

### 9. Explore — continents
Six continent cards, each with a coloured map silhouette and `48 / 48` progress.
**The most reliable navigation in the app** — and the accessible fallback for screen 8.

### 10. Flags collection
`Progress 172 / 195` + bar · grid of flag tiles with country names.
**Locked tiles are visible but dimmed** — seeing what you haven't collected is the
motivation. Never hide unearned content.

### 11. Landmarks collection
`86 / 300` · photo grid with landmark + country.
**Licensing:** every photo needs a recorded licence and attribution before ship. This
is a real blocker — see [`../engineering/security-privacy.md`](../engineering/security-privacy.md#content-licensing).

### 12. Leagues *(v2.0)*
Season countdown · tier badge (Gold I, Top 15 %) · ranked list with the user's row
highlighted · `View Rewards`.
**Cohort:** 30 players, weekly, matched by activity band. Promotion top 7, demotion
bottom 5, no demotion out of the bottom tier ever.

### 13. Profile
Avatar (editable) · level + title ("Explorer Max · Level 38 – Navigator") · XP bar
`12,850 / 15,000` · stat tiles (countries · streak · quizzes) · weekly activity bars ·
tab bar.

### 14. Achievements
`Your Progress 32 / 68` · recent achievement medals · full list with progress bars.
**Locked achievements show their criteria** unless they're in the `hidden` category.

### 15. Settings
Grouped rows: Account · Notifications · Appearance · Sound (toggle) · Language ·
Privacy · Help & Support · About · `Log Out` (red).
**Must contain, by law and by conscience:** data export, account deletion, and a
plain-language privacy summary a 12-year-old can read.

---

## Part 2 — the hidden screens

These are what make an app feel finished. Ship-blocking unless noted.

### Lifecycle
| # | Screen | Requirement |
|---|---|---|
| H1 | **First launch** | Permissions asked *in context*, never on launch |
| H2 | **Welcome back** (7+ days away) | "The world missed you." Streak repair offered, no guilt |
| H3 | **Update required** | Hard gate with a store link; only for breaking API changes |
| H4 | **Maintenance** | Server-flagged, with an ETA |
| H5 | **Session expired** | Silent refresh first; this screen only when refresh fails |

### Connectivity & failure
| # | Screen | Requirement |
|---|---|---|
| H6 | **Offline banner** | Persistent, non-blocking; "Lessons still work" |
| H7 | **No internet (blocking)** | Only for genuinely online-only features |
| H8 | **Error / 500** | Atlas with a broken compass · Retry · Contact support |
| H9 | **404 / content missing** | Deep link to removed content |
| H10 | **Sync conflict** | Rare; server wins, user is told what changed |

### Loading & emptiness
| # | Screen | Requirement |
|---|---|---|
| H11 | **Skeleton loaders** | Every list and card. **No spinners on primary content.** |
| H12 | **Empty: no friends** | Invite CTA |
| H13 | **Empty: no achievements** | "Your first is one lesson away" |
| H14 | **Empty: search no results** | Suggest 3 nearby matches |
| H15 | **Empty: nothing due today** | Celebrate it, then offer new content — never a dead end |

### Account & permissions
| # | Screen | Requirement |
|---|---|---|
| H16 | **Change email** | With re-verification |
| H17 | **Change password** | With current-password confirm |
| H18 | **Delete account** | Two-step, 30-day grace, explicit "this deletes X" list |
| H19 | **Biometric login** | Opt-in |
| H20 | **Notification permission denied** | Explain the value, deep-link to OS settings, never nag twice |
| H21 | **Parental consent** *(child accounts)* | Verifiable parental consent flow — COPPA |
| H22 | **Data export** | GDPR Art. 20; email a JSON archive |

### Commerce *(v2.0)*
Paywall · purchase pending · purchase failed · restore purchases · subscription
management · family invite accept.

---

## Screen state matrix

Copy this into every screen ticket:

| State | Required | Notes |
|---|---|---|
| Content | ✅ | The happy path |
| Loading | ✅ | Skeleton matching final layout; no layout shift |
| Empty | ✅ | Explains *why* it's empty and offers the next step |
| Error | ✅ | Human message, retry, and a support path |
| Offline | ✅ | What still works, said plainly |
| Reduced motion | ✅ | Verified, not assumed |
| 200 % text | ✅ | No clipping, no truncated CTAs |
| RTL | ✅ | Layout mirrors; the globe and flags do not |
| Screen reader | ✅ | Labels, roles, focus order, and announcements verified |

## Build order for screens

**Phase 1 (walking skeleton):** 5 → 6 → 3, ugly but real.
**v1.0 wave 1:** 1, 2, 4, 7, 9, 15 + H6, H8, H11, H15.
**v1.0 wave 2:** 8, 10, 13 + H1, H2, H12–H14, H16–H22.
**v1.5:** 11, 14, shop, Relaxed Mode.
**v2.0:** 12, paywall, family, classroom.

Rationale in [`../plan/build-order.md`](../plan/build-order.md).
