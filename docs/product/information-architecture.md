# Information architecture

Not a list of screens — a map of the whole product. Getting this wrong now means
painful navigation surgery later, which is exactly when it's hardest.

**Rule: five tabs, forever.** Home · Explore · Quests · Profile · More. New features
find a home inside these. Adding a sixth tab is a Product Bible amendment.

---

## 1. The tree

```
WorldQuest
│
├── (auth)                                    · unauthenticated
│   ├── Splash                                [screen 1]
│   ├── Onboarding carousel                   [screen 2]
│   │   ├── Value props (3 slides)
│   │   ├── Age gate  →  child flow           · COPPA/GDPR-K branch
│   │   ├── Goal picker (5 / 10 / 20 min)
│   │   └── Taster lesson  ←── NO ACCOUNT REQUIRED
│   ├── Sign in / Sign up  (Apple · Google · email · guest)
│   └── Class code entry                      · v2.0, Sarah
│
├── HOME  🏠  "your daily hub"                [screen 3]
│   ├── Greeting + streak flame
│   ├── Today's Quest card       → Daily Quest
│   ├── Continue Lesson card     → Lesson runner        ← the primary action
│   ├── Daily Challenge card     → Challenge (timed)
│   ├── Friends strip            → Friends
│   ├── League strip             → Leagues
│   ├── Event banner             → Live-ops event       · conditional
│   └── Inbox / notifications    → Inbox
│
├── EXPLORE  🧭  "discover the world"         [screens 8–11]
│   ├── Globe (3D/2D, tappable)               [screen 8]
│   │   └── Search country
│   ├── Continents                            [screen 9]
│   │   └── Continent → Country list → Country page
│   ├── Country page                          [screen 7]
│   │   ├── Hero image + favourite
│   │   ├── About (capital · population · currency · language)
│   │   ├── Lessons · Facts · Landmarks · Stats
│   │   └── Your progress (n / total)
│   ├── Collections
│   │   ├── Flags                             [screen 10]
│   │   ├── Landmarks                         [screen 11]
│   │   ├── Capitals
│   │   └── Seasonal / event collections
│   └── Subjects (v3.0)   history · wildlife · space …
│
├── QUESTS  📋  "complete & earn"             [screens 4–6]
│   ├── Daily Quest (5 challenges)            [screen 4]
│   │   └── Lesson runner                     [screen 5]
│   │       ├── Question (tap-map · flag · capital · landmark · speed)
│   │       ├── Feedback                      [screen 6]
│   │       └── Lesson summary
│   ├── Weekly quests                         · v1.5
│   ├── Friend challenges                     · v1.5
│   ├── Events                                · v2.0
│   └── Practice / Review  ←── the FSRS due queue
│
├── PROFILE  👤  "track progress"             [screen 13]
│   ├── Avatar + level + XP bar
│   ├── Stats (countries · streak · quizzes)
│   ├── Activity graph
│   ├── Achievements                          [screen 14]
│   ├── Collections owned
│   ├── Leagues & season history              [screen 12]
│   ├── Friends
│   └── Shareable profile card
│
└── MORE  ⋯  "settings & extras"              [screen 15]
    ├── Settings
    │   ├── Account (email · password · delete)
    │   ├── Notifications (per-type toggles)
    │   ├── Appearance (theme · text size · reduced motion)
    │   ├── Sound & haptics
    │   ├── Language
    │   ├── Relaxed Mode                      · v1.5
    │   ├── Privacy & data (export · erase)
    │   └── Offline & downloads
    ├── Premium                               · v2.0
    ├── Shop (coins → cosmetics)              · v1.5
    ├── Family / Parent dashboard             · v2.0, Marcus
    ├── Classroom                             · v2.0, Sarah
    ├── Help & support
    ├── Report a fact
    └── About WorldQuest
```

---

## 2. Navigation rules

1. **Tabs never nest tabs.** A tab may push a stack; a stack never shows a tab bar
   from another tab.
2. **The lesson runner is a full-screen modal.** It hides the tab bar. Exiting always
   confirms ("Leave lesson? Your progress is saved.").
3. **Depth limit: 3 pushes.** Explore → Continent → Country → Landmark detail is the
   maximum. Anything deeper is a sheet, not a push.
4. **Every push has a working back.** Hardware back on Android, swipe on iOS, and a
   visible chevron. Always.
5. **Deep links resolve to a real place**, never to a modal with no parent —
   `worldquest://country/JP` lands on Explore → Japan with a synthetic back stack.
6. **One primary action per screen.** The green button.

## 3. Entry points

| Entry | Lands on | Notes |
|---|---|---|
| Cold launch, returning user | Home | Never onboarding again |
| Cold launch, first ever | Splash → Onboarding | Taster lesson before account |
| Streak notification | Home, quest card focused | Never straight into a lesson |
| "Almost mastered" notification | Country page | Deep link |
| Friend challenge notification | Challenge screen | Requires auth |
| League notification | Leagues | |
| Share link `wq.app/c/JP` | Country page (web) → app install | |
| Class code | Classroom onboarding | v2.0 |
| Widget tap | Home or straight to Daily Quest | v1.5 |

**Rule:** a notification never opens a lesson directly. The user chooses to start.
That is the difference between an invitation and a shove.

## 4. Information hierarchy per screen

Every screen answers, in this order:

1. **Where am I?** (title, back affordance)
2. **How far along am I?** (progress bar or `n / total`)
3. **What is the one thing to do here?** (the green button)
4. **What else can I do?** (secondary actions, discoverable but quiet)

If a screen can't answer #2, ask whether it should exist.

## 5. Content taxonomy

Navigation maps onto content structure — this is what makes new subjects cheap.

```
Subject          geography                          (v3.0: history, wildlife, space)
 └ Domain        countries · flags · capitals · landmarks · physical
    └ Region     continent → subregion → country
       └ Entity  JP  (ISO 3166-1 alpha-2)
          └ Fact geo.JP.capital · geo.JP.flag · geo.JP.population
             └ Item  fact × question template  → what FSRS actually schedules
```

**Collections** cut *across* this tree (e.g. "Island Nations", "Flags with a Crescent",
"UNESCO Sites in Asia"). They are a presentation layer over entity queries, not a
separate content type — which is why a seasonal collection costs a config row, not a
release.

## 6. URL / deep-link scheme

```
worldquest://home
worldquest://explore
worldquest://explore/continent/EU
worldquest://country/JP
worldquest://country/JP/landmarks
worldquest://collection/flags
worldquest://lesson/start?topic=geo.flags.europe
worldquest://quest/daily
worldquest://leagues
worldquest://profile
worldquest://achievements
worldquest://settings/notifications
worldquest://shop
worldquest://event/<slug>
```

Mirrored on the web as `https://worldquest.app/<same-path>` for share links, SEO, and
Universal Links / App Links. Country pages are our organic acquisition surface — they
should render server-side with real content, not an install wall.

## 7. What deliberately has no home yet

Chat · user-generated packs · a feed · trading · guilds. Each is on the no-list or
deferred to v4.0. Recorded here so nobody "just adds" one and finds there's no
navigation slot for it — that absence is the design.
